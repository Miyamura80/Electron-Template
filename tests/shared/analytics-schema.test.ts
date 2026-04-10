import { describe, expect, test } from "bun:test";
import { AnalyticsCaptureSchema } from "@main/../shared/schemas";

describe("AnalyticsCaptureSchema", () => {
    test("accepts a valid event with no properties", () => {
        const result = AnalyticsCaptureSchema.safeParse({
            event: "button_clicked",
        });
        expect(result.success).toBe(true);
    });

    test("accepts a valid event with properties", () => {
        const result = AnalyticsCaptureSchema.safeParse({
            event: "page_viewed",
            properties: { page: "/settings", duration_ms: 1200 },
        });
        expect(result.success).toBe(true);
    });

    test("rejects an empty event name", () => {
        const result = AnalyticsCaptureSchema.safeParse({ event: "" });
        expect(result.success).toBe(false);
    });

    test("rejects a missing event field", () => {
        const result = AnalyticsCaptureSchema.safeParse({
            properties: { key: "value" },
        });
        expect(result.success).toBe(false);
    });

    test("rejects a non-string event", () => {
        const result = AnalyticsCaptureSchema.safeParse({ event: 42 });
        expect(result.success).toBe(false);
    });

    test("rejects a non-object properties value", () => {
        const result = AnalyticsCaptureSchema.safeParse({
            event: "test",
            properties: "not-an-object",
        });
        expect(result.success).toBe(false);
    });
});
