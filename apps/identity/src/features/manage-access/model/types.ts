export type Profile = {
  user: { id: string; name?: string; email?: string } | null;
  entitlements: { premium: boolean };
};

export type Checkout = { checkoutUrl?: string; status: string };
export type Order = { status: string };
