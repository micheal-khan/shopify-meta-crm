import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createXlsx } from "./xlsx";

describe("XLSX export", () => {
  it("creates a valid OOXML workbook archive", () => {
    const archive = unzipSync(createXlsx(["order", "total"], [["#1001", 999]]));
    expect(archive["xl/workbook.xml"]).toBeDefined();
    expect(new TextDecoder().decode(archive["xl/worksheets/sheet1.xml"])).toContain("#1001");
  });
});
