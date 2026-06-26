// JSON Schema for the PUBLISHED MakerPerks perks.json payload (the agent contract).
//
// This validates what we actually consume — a flattened projection — NOT the
// per-program source schema. (MakerPerks' program.schema.json validates the source
// YAML records, which this adapter never reads.) See docs/ARCHITECTURE.md §4.
//
// Lenient to additive upstream fields (additionalProperties: true) so a benign new
// field does not break consumption; strict on the fields we depend on, so a missing
// or mis-typed required field fails loud.

export const perksPayloadSchema = {
  title: "MakerPerks perks.json payload",
  type: "object",
  required: ["name", "programs"],
  additionalProperties: true,
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    homepage: { type: "string" },
    generated: { type: "string" },
    count: { type: "integer", minimum: 0 },
    programs: {
      type: "array",
      items: {
        type: "object",
        required: [
          "slug",
          "title",
          "provider",
          "url",
          "max_value",
          "audience",
          "sources",
          "verified",
        ],
        additionalProperties: true,
        properties: {
          slug: { type: "string" },
          title: { type: "string" },
          provider: { type: "string" },
          url: { type: "string", format: "uri" },
          audience: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
          value_type: { type: "string", enum: ["credits", "discount", "free_tier"] },
          currency: { type: "string" },
          min_value: { type: "number" },
          max_value: { type: "number" },
          value_display: { type: "string" },
          region: { type: "string" },
          status: {
            type: "string",
            enum: ["Active", "Discontinued", "Beta", "Upcoming"],
          },
          aggregator: { type: "boolean" },
          unlocks: { type: "array", items: { type: "string" } },
          sources: { type: "array", items: { type: "string" } },
          verified: { type: "string" },
        },
      },
    },
  },
};
