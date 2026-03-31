CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  organization_id uuid,
  event_type text NOT NULL,
  resource_type text,
  resource_id uuid,
  metadata jsonb DEFAULT '{}',
  ip_address inet,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_security_events_org ON security_events(organization_id);
CREATE INDEX idx_security_events_user ON security_events(user_id);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_created ON security_events(created_at);
