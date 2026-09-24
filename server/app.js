/**
 * Main API server — mount corporate pickup routes under /api/pickup-entry
 * so the frontend path matches: PUT {VITE_SERVER_API}/pickup-entry/update-corporate-tax-invoice-preview-approval
 * i.e. PUT /api/pickup-entry/update-corporate-tax-invoice-preview-approval when VITE_SERVER_API=http://host:port/api
 */
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const corporatePickupEntryRoutes = require("./routes/corporate_pickup_entry_routes");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "sparkle-sales-api" });
});

/** Must match frontend: VITE_SERVER_API + '/pickup-entry/...' → typically /api/pickup-entry */
app.use("/api/pickup-entry", corporatePickupEntryRoutes);

app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Not Found" });
});

app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
    console.log(`Pickup entry base: http://localhost:${PORT}/api/pickup-entry`);
});
