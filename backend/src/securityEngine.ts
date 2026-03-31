import crypto from 'crypto';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface RiskInput {
  actorId: string;
  userId: string;
  queryValue: string;
  endpoint: string;
  ip: string;
}

interface QueryOutcomeInput {
  actorId: string;
  userId: string;
  queryValue: string;
  hadResult: boolean;
}

interface RiskDecision {
  score: number;
  level: RiskLevel;
  recommendedDelayMs: number;
  reasons: string[];
}

interface SecurityMetrics {
  total_requests: number;
  medium_risk: number;
  high_risk: number;
  critical_risk: number;
  blocked_requests: number;
  degraded_responses: number;
}

type RedisClientLike = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ...args: (string | number)[]) => Promise<unknown>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  zadd: (key: string, score: number, member: string) => Promise<number>;
  zcount: (key: string, min: number | string, max: number | string) => Promise<number>;
  zremrangebyscore: (key: string, min: number | string, max: number | string) => Promise<number>;
  hset: (key: string, data: Record<string, string | number>) => Promise<number>;
  hgetall: (key: string) => Promise<Record<string, string>>;
  sadd: (key: string, ...members: string[]) => Promise<number>;
  scard: (key: string) => Promise<number>;
};

class MemoryRedis implements RedisClientLike {
  private kv = new Map<string, string>();
  private zsets = new Map<string, Array<{ score: number; member: string }>>();
  private hmaps = new Map<string, Record<string, string>>();
  private sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.kv.get(key) || null;
  }

  async set(key: string, value: string): Promise<unknown> {
    this.kv.set(key, value);
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const val = Number(this.kv.get(key) || '0') + 1;
    this.kv.set(key, String(val));
    return val;
  }

  async expire(): Promise<number> {
    return 1;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    const arr = this.zsets.get(key) || [];
    arr.push({ score, member });
    this.zsets.set(key, arr);
    return 1;
  }

  async zcount(key: string, min: number | string, max: number | string): Promise<number> {
    const arr = this.zsets.get(key) || [];
    const minNum = typeof min === 'string' ? Number(min) : min;
    const maxNum = typeof max === 'string' ? Number(max) : max;
    return arr.filter((item) => item.score >= minNum && item.score <= maxNum).length;
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    const arr = this.zsets.get(key) || [];
    const minNum = typeof min === 'string' ? Number(min) : min;
    const maxNum = typeof max === 'string' ? Number(max) : max;
    const filtered = arr.filter((item) => !(item.score >= minNum && item.score <= maxNum));
    const removed = arr.length - filtered.length;
    this.zsets.set(key, filtered);
    return removed;
  }

  async hset(key: string, data: Record<string, string | number>): Promise<number> {
    const prev = this.hmaps.get(key) || {};
    const next: Record<string, string> = { ...prev };
    Object.entries(data).forEach(([k, v]) => {
      next[k] = String(v);
    });
    this.hmaps.set(key, next);
    return 1;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.hmaps.get(key) || {};
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key) || new Set<string>();
    members.forEach((m) => set.add(m));
    this.sets.set(key, set);
    return set.size;
  }

  async scard(key: string): Promise<number> {
    return (this.sets.get(key) || new Set<string>()).size;
  }
}

export class SecurityEngine {
  private redis: RedisClientLike;
  private readonly namespace = 'inmoscore:sec';

  constructor(redisUrl?: string) {
    if (redisUrl) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Redis = require('ioredis');
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableAutoPipelining: true
      });
    } else {
      this.redis = new MemoryRedis();
    }
  }

  createActorId(userId: string, deviceFingerprint: string, behaviorPattern: string): string {
    const seed = `${userId}|${deviceFingerprint || 'no-fp'}|${behaviorPattern}`;
    return crypto.createHash('sha256').update(seed).digest('hex');
  }

  private key(name: string): string {
    return `${this.namespace}:${name}`;
  }

  private async incrementMetric(name: keyof SecurityMetrics): Promise<void> {
    const key = this.key(`metrics:${name}`);
    await this.redis.incr(key);
    await this.redis.expire(key, 60 * 60 * 24 * 30);
  }

  private numericEntropy(value: string): number {
    const chars = value.split('');
    const freq: Record<string, number> = {};
    chars.forEach((ch) => {
      freq[ch] = (freq[ch] || 0) + 1;
    });
    return Object.values(freq).reduce((acc, count) => {
      const p = count / chars.length;
      return acc - p * Math.log2(p);
    }, 0);
  }

  async calculateRiskScore(input: RiskInput): Promise<RiskDecision> {
    const now = Date.now();
    const reasons: string[] = [];
    let score = 0;

    await this.incrementMetric('total_requests');

    const actorWindowKey = this.key(`actor:${input.actorId}:window`);
    await this.redis.zadd(actorWindowKey, now, `${now}:${input.queryValue}`);
    await this.redis.zremrangebyscore(actorWindowKey, 0, now - 15 * 60 * 1000);
    await this.redis.expire(actorWindowKey, 60 * 20);

    const perMinute = await this.redis.zcount(actorWindowKey, now - 60 * 1000, now);
    const perFiveMinutes = await this.redis.zcount(actorWindowKey, now - 5 * 60 * 1000, now);
    const perFifteenMinutes = await this.redis.zcount(actorWindowKey, now - 15 * 60 * 1000, now);

    if (perMinute >= 12) {
      score += 28;
      reasons.push('high_frequency_1m');
    } else if (perMinute >= 7) {
      score += 18;
      reasons.push('elevated_frequency_1m');
    }

    if (perFiveMinutes >= 40) {
      score += 20;
      reasons.push('burst_5m');
    }

    if (perFifteenMinutes >= 90) {
      score += 16;
      reasons.push('sustained_15m');
    }

    const sequenceKey = this.key(`actor:${input.actorId}:sequence`);
    const sequenceRaw = await this.redis.get(sequenceKey);
    const currentNumeric = Number(input.queryValue.replace(/\D/g, ''));
    if (!Number.isNaN(currentNumeric)) {
      if (sequenceRaw) {
        const prev = Number(sequenceRaw);
        if (!Number.isNaN(prev) && Math.abs(currentNumeric - prev) <= 2) {
          score += 15;
          reasons.push('sequential_enumeration_pattern');
        }
      }
      await this.redis.set(sequenceKey, String(currentNumeric));
      await this.redis.expire(sequenceKey, 60 * 60);
    }

    const entropy = this.numericEntropy(input.queryValue);
    if (entropy < 1.4) {
      score += 8;
      reasons.push('low_entropy_input');
    }

    const queryHash = crypto.createHash('sha1').update(input.queryValue).digest('hex');
    const recentQueryActorsKey = this.key(`query:${queryHash}:actors`);
    await this.redis.sadd(recentQueryActorsKey, input.actorId);
    await this.redis.expire(recentQueryActorsKey, 60 * 10);
    const distinctActorsOnSameQuery = await this.redis.scard(recentQueryActorsKey);
    if (distinctActorsOnSameQuery >= 4) {
      score += 26;
      reasons.push('distributed_query_cluster');
    } else if (distinctActorsOnSameQuery >= 2) {
      score += 12;
      reasons.push('shared_query_pattern');
    }

    const userClusterKey = this.key(`query:${queryHash}:users`);
    await this.redis.sadd(userClusterKey, input.userId);
    await this.redis.expire(userClusterKey, 60 * 30);
    const distinctUsers = await this.redis.scard(userClusterKey);
    if (distinctUsers >= 5) {
      score += 18;
      reasons.push('multi_account_correlation');
    }

    const ipClusterKey = this.key(`query:${queryHash}:ips`);
    await this.redis.sadd(ipClusterKey, input.ip || 'unknown');
    await this.redis.expire(ipClusterKey, 60 * 10);
    const distinctIps = await this.redis.scard(ipClusterKey);
    if (distinctIps >= 6) {
      score += 10;
      reasons.push('vpn_rotation_signal');
    }

    score = Math.min(100, score);

    let level: RiskLevel = 'low';
    let recommendedDelayMs = 0;
    if (score >= 80) {
      level = 'critical';
      await this.incrementMetric('critical_risk');
      await this.incrementMetric('blocked_requests');
    } else if (score >= 55) {
      level = 'high';
      await this.incrementMetric('high_risk');
      await this.incrementMetric('degraded_responses');
      recommendedDelayMs = 1200;
    } else if (score >= 30) {
      level = 'medium';
      await this.incrementMetric('medium_risk');
      recommendedDelayMs = 700;
    }

    return { score, level, recommendedDelayMs, reasons };
  }

  async registerOutcome(input: QueryOutcomeInput): Promise<void> {
    const ratioKey = this.key(`actor:${input.actorId}:outcome`);
    const current = await this.redis.hgetall(ratioKey);
    const hits = Number(current.hits || '0') + (input.hadResult ? 1 : 0);
    const misses = Number(current.misses || '0') + (input.hadResult ? 0 : 1);
    await this.redis.hset(ratioKey, { hits, misses, updated_at: Date.now() });
    await this.redis.expire(ratioKey, 60 * 60 * 24);
  }

  async getOutcomeSignal(actorId: string): Promise<number> {
    const current = await this.redis.hgetall(this.key(`actor:${actorId}:outcome`));
    const hits = Number(current.hits || '0');
    const misses = Number(current.misses || '0');
    const total = hits + misses;
    if (total < 6) return 0;
    const missRatio = misses / total;
    if (missRatio >= 0.8) return 20;
    if (missRatio >= 0.6) return 10;
    return 0;
  }

  async getDashboard(): Promise<{
    metrics: SecurityMetrics;
    top_distributed_queries: Array<{ query_hash: string; distinct_actors: number }>;
  }> {
    const read = async (key: keyof SecurityMetrics): Promise<number> => {
      const val = await this.redis.get(this.key(`metrics:${key}`));
      return Number(val || '0');
    };

    const metrics: SecurityMetrics = {
      total_requests: await read('total_requests'),
      medium_risk: await read('medium_risk'),
      high_risk: await read('high_risk'),
      critical_risk: await read('critical_risk'),
      blocked_requests: await read('blocked_requests'),
      degraded_responses: await read('degraded_responses')
    };

    return {
      metrics,
      top_distributed_queries: []
    };
  }
}

export type { RiskDecision, RiskLevel };
