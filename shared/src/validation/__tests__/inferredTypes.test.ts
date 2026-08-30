/**
 * Tests for the inferred validation types exported from the schemas (QI-039).
 *
 * Because the suite runs under ts-jest, the type-level assertions below are
 * checked at compile time: if a schema-inferred type stops lining up with its
 * canonical domain interface, this file fails to compile. The runtime cases
 * additionally confirm that `ValidationService` returns data shaped like the
 * exported inferred types.
 */

import {
  ValidationService,
  PrivacySettingsSchema,
  DataSchemaSchema,
  AnalysisParametersSchema,
  XRayAnalysisSchema,
  VisualizationConfigSchema,
  ValidatedPrivacySettings,
  ValidatedDataField,
  ValidatedDataSchema,
  ValidatedAnalysisParameters,
  ValidatedXRayAnalysis,
  ValidatedVisualizationConfig,
} from "../index";
import {
  PrivacyLevel,
  AnonymizationTechnique,
  DataType,
  PrivacySettings,
  DataField,
  DataSchema,
} from "../../types/privacy";
import {
  AnalysisType,
  AggregationType,
  NoiseMechanism,
  AnonymizationLevel,
  AnalysisStatus,
  VisualizationType,
  AnalysisParameters,
  XRayAnalysis,
  VisualizationConfig,
} from "../../types/analytics";

// ---------------------------------------------------------------------------
// Compile-time: a canonical domain object is assignable to the inferred type,
// and the inferred type is exported and usable as an annotation. (The issue's
// reproduction: annotate a value with the schema's type without re-declaring.)
// ---------------------------------------------------------------------------
describe("exported inferred validation types (compile-time)", () => {
  it("accepts canonical domain objects as inferred types", () => {
    const privacy: PrivacySettings = {
      level: PrivacyLevel.HIGH,
      dataRetentionDays: 30,
      allowDataExport: false,
      allowSharing: false,
      differentialPrivacyEpsilon: 1,
      minimumParticipants: 5,
      anonymizationTechnique: AnonymizationTechnique.K_ANONYMITY,
    };
    const validatedPrivacy: ValidatedPrivacySettings = privacy;
    expect(validatedPrivacy.level).toBe(PrivacyLevel.HIGH);

    const field: DataField = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "age",
      type: DataType.NUMERICAL,
      required: true,
      sensitive: false,
      encryptionRequired: false,
    };
    const validatedField: ValidatedDataField = field;
    expect(validatedField.name).toBe("age");

    const schema: DataSchema = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "dataset",
      fields: [field],
      privacySettings: privacy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const validatedSchema: ValidatedDataSchema = schema;
    expect(validatedSchema.fields).toHaveLength(1);

    const params: AnalysisParameters = {
      fields: ["age"],
      aggregations: [AggregationType.COUNT, AggregationType.AVERAGE],
      privacyBudget: 1,
    };
    const validatedParams: ValidatedAnalysisParameters = params;
    expect(validatedParams.fields).toEqual(["age"]);

    const viz: VisualizationConfig = {
      type: VisualizationType.BAR_CHART,
      title: "chart",
      dataSource: "ds",
      config: {},
    };
    const validatedViz: ValidatedVisualizationConfig = viz;
    expect(validatedViz.type).toBe(VisualizationType.BAR_CHART);

    const xray: XRayAnalysis = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "analysis",
      description: "desc",
      type: AnalysisType.DESCRIPTIVE,
      parameters: params,
      privacySettings: {
        differentialPrivacyEpsilon: 1,
        minimumSampleSize: 5,
        noiseMechanism: NoiseMechanism.LAPLACE,
        anonymizationLevel: AnonymizationLevel.MEDIUM,
      },
      status: AnalysisStatus.PENDING,
      createdAt: new Date(),
    };
    const validatedXray: ValidatedXRayAnalysis = xray;
    expect(validatedXray.status).toBe(AnalysisStatus.PENDING);
  });
});

// ---------------------------------------------------------------------------
// Runtime: schemas accept the same enum string values they did before the
// nativeEnum refactor, and ValidationService returns the inferred shapes.
// ---------------------------------------------------------------------------
describe("schema validation runtime behaviour", () => {
  it("parses a valid PrivacySettings into the inferred type", () => {
    const result = ValidationService.validatePrivacySettings({
      level: PrivacyLevel.STANDARD,
      dataRetentionDays: 90,
      allowDataExport: true,
      allowSharing: false,
      differentialPrivacyEpsilon: 0.5,
      minimumParticipants: 3,
      anonymizationTechnique: AnonymizationTechnique.DIFFERENTIAL_PRIVACY,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data: ValidatedPrivacySettings = result.data;
      expect(data.dataRetentionDays).toBe(90);
    }
  });

  it("accepts enum string values for analysis aggregations", () => {
    const result = AnalysisParametersSchema.safeParse({
      fields: ["a"],
      aggregations: ["count", "sum"], // raw enum string values
      privacyBudget: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aggregations).toEqual([
        AggregationType.COUNT,
        AggregationType.SUM,
      ]);
    }
  });

  it("accepts enum string values for X-Ray privacy settings and status", () => {
    const result = XRayAnalysisSchema.safeParse({
      id: "44444444-4444-4444-8444-444444444444",
      name: "a",
      description: "d",
      type: "descriptive",
      parameters: { fields: ["a"], privacyBudget: 1 },
      privacySettings: {
        differentialPrivacyEpsilon: 1,
        minimumSampleSize: 5,
        noiseMechanism: "gaussian",
        anonymizationLevel: "high",
      },
      status: "running",
      createdAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid enum values", () => {
    const result = AnalysisParametersSchema.safeParse({
      fields: ["a"],
      aggregations: ["not_a_real_aggregation"],
      privacyBudget: 1,
    });
    expect(result.success).toBe(false);
  });

  it("validates a DataSchema and VisualizationConfig end to end", () => {
    const schemaResult = ValidationService.validateDataSchema({
      id: "55555555-5555-4555-8555-555555555555",
      name: "dataset",
      fields: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          name: "age",
          type: DataType.NUMERICAL,
          required: true,
          sensitive: false,
          encryptionRequired: false,
        },
      ],
      privacySettings: {
        level: PrivacyLevel.HIGH,
        dataRetentionDays: 30,
        allowDataExport: false,
        allowSharing: false,
        differentialPrivacyEpsilon: 1,
        minimumParticipants: 2,
        anonymizationTechnique: AnonymizationTechnique.K_ANONYMITY,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(schemaResult.success).toBe(true);

    const vizResult = ValidationService.validateVisualizationConfig({
      type: VisualizationType.LINE_CHART,
      title: "trend",
      dataSource: "ds",
      config: { x: "time" },
    });
    expect(vizResult.success).toBe(true);
  });

  // Reference the remaining schema imports so the type-only intent is explicit.
  it("exposes the schemas used by consumers", () => {
    expect(PrivacySettingsSchema).toBeDefined();
    expect(DataSchemaSchema).toBeDefined();
    expect(VisualizationConfigSchema).toBeDefined();
  });
});
