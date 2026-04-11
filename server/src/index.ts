import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get("/", (c) => {
  return c.json({
    name: "ProofPay x402 Server",
    version: "0.1.0",
    status: "ok",
    docs: "https://github.com/your-org/proofpay",
  });
});

// ─────────────────────────────────────────────
// x402 Protected Resource Example
// Returns 402 if no valid payment header is present
// ─────────────────────────────────────────────
app.get("/api/data/:resource", async (c) => {
  const paymentHeader = c.req.header("X-PAYMENT");

  if (!paymentHeader) {
    // Build x402 challenge per the x402 spec
    const challenge = {
      version: "1",
      scheme: "exact",
      network: "solana",
      maxAmountRequired: "100000", // 0.10 USDC (6 decimals)
      resource: c.req.url,
      description: "Access to ProofPay protected resource",
      memoPrefix: "proofpay-",
      payTo: process.env.TREASURY_WALLET ?? "YourWalletAddressHere",
      requiredDeadlineSeconds: 60,
      extra: {
        name: "ProofPay",
        version: "0.1.0",
      },
    };

    return c.json(
      {
        error: "Payment Required",
        accepts: [challenge],
      },
      402,
      {
        "X-PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)),
      }
    );
  }

  // TODO: Verify payment signature on-chain via Solana RPC
  // For now, return placeholder response
  return c.json({
    resource: c.req.param("resource"),
    data: { message: "Access granted via ProofPay x402" },
    paid: true,
  });
});

// ─────────────────────────────────────────────
// Escrow Status endpoint
// ─────────────────────────────────────────────
app.get("/api/escrow/:escrowId", async (c) => {
  const escrowId = c.req.param("escrowId");
  // TODO: Fetch from Solana via Anchor client
  return c.json({
    escrowId,
    status: "funded",
    message: "On-chain fetch coming in M2",
  });
});

const port = parseInt(process.env.PORT ?? "3001");
console.log(`🚀 ProofPay x402 Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
