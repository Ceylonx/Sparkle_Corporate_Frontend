export function normalizePickupTrackResponse(body) {
    if (body == null || typeof body !== "object") return body;
    const nested = body.data;
    const row = body.pickup_entry;
    const hasNested = nested != null && typeof nested === "object" && !Array.isArray(nested);
    const hasRow = row != null && typeof row === "object" && !Array.isArray(row);
    let merged = { ...body };
    if (hasNested) merged = { ...merged, ...nested };
    if (hasRow) merged = { ...merged, ...row };

    const dtCandidates = [
        merged.delivery_type,
        merged.deliveryType,
        hasNested ? nested.delivery_type : undefined,
        hasNested ? nested.deliveryType : undefined,
        hasRow ? row.delivery_type : undefined,
        hasRow ? row.deliveryType : undefined,
        body.delivery_type,
        body.deliveryType,
    ];
    const dt = dtCandidates.find((v) => v != null && String(v).trim() !== "");
    if (dt != null) merged.delivery_type = String(dt).trim();

    const pctCandidates = [
        merged.delivery_percentage,
        merged.deliveryPercentage,
        hasNested ? nested.delivery_percentage : undefined,
        hasNested ? nested.deliveryPercentage : undefined,
        hasRow ? row.delivery_percentage : undefined,
        hasRow ? row.deliveryPercentage : undefined,
        body.delivery_percentage,
        body.deliveryPercentage,
    ];
    const pct = pctCandidates.find((v) => v != null && v !== "");
    if (pct != null) merged.delivery_percentage = Number(pct);

    return merged;
}