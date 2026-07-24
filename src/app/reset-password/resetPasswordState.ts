export type ResetPasswordActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export const initialResetPasswordState: ResetPasswordActionState = {
  status: "idle",
  message: "",
};
