import { describe, test, expect } from "node:test";
import { validateFieldAuthorityMappings, FieldAuthorityMapping } from "../src/authority-mapping";

describe("Field Authority Mapping Validation", () => {
  test("should validate that all fields have authority mappings", () => {
    const result = validateFieldAuthorityMappings();
    
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  test("should ensure no provider secrets in contracts", () => {
    // Check that no field names suggest credentials or secrets
    const sensitiveFields = ["password", "secret", "token", "key", "credential"];
    
    for (const field in FieldAuthorityMapping) {
      const isSensitive = sensitiveFields.some(sensitive => 
        field.toLowerCase().includes(sensitive)
      );
      
      expect(isSensitive).toBe(false);
    }
  });

  test("should ensure no parallel payment and connectivity authority", () => {
    // Check that no field combines both payment and connectivity authorities
    const paymentFields = Object.keys(FieldAuthorityMapping).filter(field => 
      FieldAuthorityMapping[field].includes("payment")
    );
    
    const connectivityFields = Object.keys(FieldAuthorityMapping).filter(field => 
      FieldAuthorityMapping[field].includes("connectivity")
    );
    
    // There should be no overlap
    const overlappingFields = paymentFields.filter(field => 
      connectivityFields.includes(field)
    );
    
    expect(overlappingFields).toHaveLength(0);
  });

  test("should ensure all payment references are opaque", () => {
    const paymentReferenceFields = Object.keys(FieldAuthorityMapping).filter(field => 
      FieldAuthorityMapping[field] === "payment-reference"
    );
    
    // Payment references should exist
    expect(paymentReferenceFields.length).toBeGreaterThan(0);
    
    // Each should be a reference, not direct payment info
    paymentReferenceFields.forEach(field => {
      expect(field).not.toContain("amount");
      expect(field).not.toContain("currency");
      expect(field).not.toContain("account");
    });
  });
});