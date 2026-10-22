/** Browser-safe response types. Importing these types must not load server code. */
export type ApiSuccess<T> = {
  code: 0;
  msg: "success";
  data: T;
  error?: never;
};

export type ApiFailure = {
  /** Stable, positive business code from the server's error registry. */
  code: number;
  msg: string;
  error: { type: string };
  data?: never;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
