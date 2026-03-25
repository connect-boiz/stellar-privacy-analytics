import {
  GroupByResult,
  DifferentialPrivacyResult,
  NoiseParameters,
  DPAggregationType,
  PrivacyMode
} from '@stellar/shared';
import { NoiseGenerator } from './noiseGenerator';
import { SensitivityAnalyzer } from './sensitivityAnalyzer';

interface GroupByData {
  groupKey: string;
  values: Record<string, number>;
  count: number;
}

interface GroupByQuery {
  groupColumns: string[];
  aggregations: Array<{
    type: DPAggregationType;
    column: string;
    alias?: string;
  }>;
  data: GroupByData[];
}

export class GroupByNoiseHandler {
  private noiseGenerator: NoiseGenerator;
  private sensitivityAnalyzer: SensitivityAnalyzer;

  constructor() {
    this.noiseGenerator = new NoiseGenerator();
    this.sensitivityAnalyzer = new SensitivityAnalyzer();
  }

  async applyGroupByNoise(
    query: GroupByQuery,
    epsilon: number,
    mechanism: DPNoiseMechanism,
    mode: PrivacyMode = PrivacyMode.STRICT
  ): Promise<GroupByResult[]> {
    if (!query.data || query.data.length === 0) {
      return [];
    }

    const epsilonPerGroup = this.calculateEpsilonPerGroup(epsilon, query.data.length, mode);
    const results: GroupByResult[] = [];

    for (const groupData of query.data) {
      const groupResult = await this.applyNoiseToGroup(
        groupData,
        query.aggregations,
        epsilonPerGroup,
        mechanism,
        mode
      );
      
      results.push(groupResult);
    }

    return results;
  }

  private calculateEpsilonPerGroup(
    totalEpsilon: number,
    groupCount: number,
    mode: PrivacyMode
  ): number {
    if (mode === PrivacyMode.STRICT) {
      return totalEpsilon / groupCount;
    }

    const relaxedMultiplier = 0.8;
    const adjustedEpsilon = totalEpsilon * relaxedMultiplier;
    return adjustedEpsilon / groupCount;
  }

  private async applyNoiseToGroup(
    groupData: GroupByData,
    aggregations: Array<{
      type: DPAggregationType;
      column: string;
      alias?: string;
    }>,
    epsilon: number,
    mechanism: DPNoiseMechanism,
    mode: PrivacyMode
  ): Promise<GroupByResult> {
    const results: DifferentialPrivacyResult[] = [];
    let totalEpsilonUsed = 0;

    for (const agg of aggregations) {
      const originalValue = groupData.values[agg.column] || 0;
      const sensitivity = this.calculateGroupSensitivity(agg, groupData, mode);
      
      const noiseParams: NoiseParameters = {
        scale: sensitivity / epsilon,
        mechanism,
        sensitivity,
        epsilon: epsilon / aggregations.length
      };

      const dpResult = this.noiseGenerator.addNoise(originalValue, noiseParams);
      results.push(dpResult);
      totalEpsilonUsed += dpResult.epsilonUsed;
    }

    return {
      groupKey: groupData.groupKey,
      results,
      totalEpsilonUsed
    };
  }

  private calculateGroupSensitivity(
    aggregation: {
      type: DPAggregationType;
      column: string;
      alias?: string;
    },
    groupData: GroupByData,
    mode: PrivacyMode
  ): number {
    switch (aggregation.type) {
      case DPAggregationType.COUNT:
        return mode === PrivacyMode.STRICT ? 1 : 0.5;
      
      case DPAggregationType.SUM:
        const sumValue = groupData.values[aggregation.column] || 0;
        const maxValue = Math.abs(sumValue) * 1.5;
        return mode === PrivacyMode.STRICT ? maxValue : maxValue * 0.5;
      
      case DPAggregationType.AVERAGE:
        const avgValue = groupData.values[aggregation.column] || 0;
        const maxAvgValue = Math.abs(avgValue) * 2;
        return mode === PrivacyMode.STRICT ? maxAvgValue : maxAvgValue * 0.5;
      
      case DPAggregationType.MIN:
      case DPAggregationType.MAX:
        const minMaxValue = groupData.values[aggregation.column] || 0;
        const range = Math.abs(minMaxValue) * 2;
        return mode === PrivacyMode.STRICT ? range : range * 0.5;
      
      case DPAggregationType.VARIANCE:
        const varianceValue = groupData.values[aggregation.column] || 0;
        const maxVariance = Math.abs(varianceValue) * 3;
        return mode === PrivacyMode.STRICT ? maxVariance : maxVariance * 0.5;
      
      default:
        throw new Error(`Unsupported aggregation type for group-by: ${aggregation.type}`);
    }
  }

  applyAdaptiveGroupByNoise(
    query: GroupByQuery,
    epsilon: number,
    mechanism: DPNoiseMechanism,
    mode: PrivacyMode = PrivacyMode.STRICT
  ): GroupByResult[] {
    if (!query.data || query.data.length === 0) {
      return [];
    }

    const groupSizes = query.data.map(group => group.count);
    const totalSize = groupSizes.reduce((sum, size) => sum + size, 0);
    
    const epsilonAllocations = this.calculateAdaptiveEpsilonAllocation(
      epsilon,
      groupSizes,
      totalSize,
      mode
    );

    return query.data.map((groupData, index) => {
      const groupEpsilon = epsilonAllocations[index];
      return this.applyNoiseToGroup(
        groupData,
        query.aggregations,
        groupEpsilon,
        mechanism,
        mode
      );
    });
  }

  private calculateAdaptiveEpsilonAllocation(
    totalEpsilon: number,
    groupSizes: number[],
    totalSize: number,
    mode: PrivacyMode
  ): number[] {
    const minGroupSize = Math.min(...groupSizes);
    const maxGroupSize = Math.max(...groupSizes);
    
    if (mode === PrivacyMode.RELAXED) {
      const relaxedEpsilon = totalEpsilon * 0.8;
      return groupSizes.map(size => (relaxedEpsilon * size) / totalSize);
    }

    const sizeWeights = groupSizes.map(size => {
      if (maxGroupSize === minGroupSize) {
        return 1 / groupSizes.length;
      }
      const normalizedSize = (size - minGroupSize) / (maxGroupSize - minGroupSize);
      const weight = 0.3 + 0.7 * normalizedSize;
      return weight;
    });

    const totalWeight = sizeWeights.reduce((sum, weight) => sum + weight, 0);
    return sizeWeights.map(weight => (totalEpsilon * weight) / totalWeight);
  }

  applyHierarchicalGroupByNoise(
    query: GroupByQuery,
    epsilon: number,
    mechanism: DPNoiseMechanism,
    hierarchyLevels: string[][],
    mode: PrivacyMode = PrivacyMode.STRICT
  ): GroupByResult[] {
    if (!query.data || query.data.length === 0) {
      return [];
    }

    const epsilonPerLevel = epsilon / hierarchyLevels.length;
    const results: GroupByResult[] = [];

    for (const level of hierarchyLevels) {
      const levelGroups = this.groupDataByLevel(query.data, level);
      const levelQuery: GroupByQuery = {
        ...query,
        data: levelGroups
      };

      const levelResults = this.applyGroupByNoise(
        levelQuery,
        epsilonPerLevel,
        mechanism,
        mode
      );

      results.push(...levelResults);
    }

    return results;
  }

  private groupDataByLevel(data: GroupByData[], levelColumns: string[]): GroupByData[] {
    const groupedData = new Map<string, GroupByData>();

    for (const item of data) {
      const levelKey = this.extractLevelKey(item.groupKey, levelColumns);
      
      if (!groupedData.has(levelKey)) {
        groupedData.set(levelKey, {
          groupKey: levelKey,
          values: {},
          count: 0
        });
      }

      const group = groupedData.get(levelKey)!;
      group.count += item.count;
      
      for (const [key, value] of Object.entries(item.values)) {
        group.values[key] = (group.values[key] || 0) + value;
      }
    }

    return Array.from(groupedData.values());
  }

  private extractLevelKey(groupKey: string, levelColumns: string[]): string {
    const keyParts = groupKey.split('|');
    const levelIndices = levelColumns.map(col => {
      const index = parseInt(col.replace(/[^\d]/g, ''));
      return isNaN(index) ? 0 : index;
    });

    return levelIndices
      .filter(index => index < keyParts.length)
      .map(index => keyParts[index])
      .join('|');
  }

  validateGroupByQuery(query: GroupByQuery): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!query.groupColumns || query.groupColumns.length === 0) {
      errors.push('Group-by query must specify at least one group column');
    }

    if (!query.aggregations || query.aggregations.length === 0) {
      errors.push('Group-by query must specify at least one aggregation');
    }

    if (query.aggregations.length > 10) {
      errors.push('Too many aggregations. Maximum 10 allowed per group-by query');
    }

    if (!query.data || query.data.length === 0) {
      errors.push('Group-by query must have data to process');
    }

    for (const agg of query.aggregations) {
      if (!agg.column) {
        errors.push(`Aggregation missing column specification`);
      }
    }

    for (const groupData of query.data) {
      if (!groupData.groupKey) {
        errors.push('Group data missing group key');
      }
      
      if (groupData.count <= 0) {
        errors.push(`Group ${groupData.groupKey} has invalid count: ${groupData.count}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  estimateGroupByNoiseMagnitude(
    query: GroupByQuery,
    epsilon: number,
    mechanism: DPNoiseMechanism,
    mode: PrivacyMode = PrivacyMode.STRICT
  ): { averageNoise: number; maxNoise: number; totalEpsilonUsed: number } {
    if (!query.data || query.data.length === 0) {
      return { averageNoise: 0, maxNoise: 0, totalEpsilonUsed: 0 };
    }

    const epsilonPerGroup = this.calculateEpsilonPerGroup(epsilon, query.data.length, mode);
    const epsilonPerAgg = epsilonPerGroup / query.aggregations.length;
    
    const noiseEstimates = query.data.flatMap(groupData =>
      query.aggregations.map(agg => {
        const sensitivity = this.calculateGroupSensitivity(agg, groupData, mode);
        const noiseParams: NoiseParameters = {
          scale: sensitivity / epsilonPerAgg,
          mechanism,
          sensitivity,
          epsilon: epsilonPerAgg
        };
        return this.noiseGenerator.estimateNoiseMagnitude(noiseParams);
      })
    );

    const averageNoise = noiseEstimates.reduce((sum, noise) => sum + noise, 0) / noiseEstimates.length;
    const maxNoise = Math.max(...noiseEstimates);
    const totalEpsilonUsed = epsilon;

    return { averageNoise, maxNoise, totalEpsilonUsed };
  }
}
