interface ABTest {
  id: string;
  models: string[];
  weights: number[];
  createdAt: number;
  requestCount: number;
  modelCounts: Record<string, number>;
}

const tests = new Map<string, ABTest>();

export function createABTest(id: string, models: string[], weights?: number[]): ABTest {
  const w = weights || models.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  const normalized = w.map(v => v / total);
  const test: ABTest = {
    id, models, weights: normalized,
    createdAt: Date.now(), requestCount: 0, modelCounts: {},
  };
  tests.set(id, test);
  return test;
}

export function selectABTest(testId: string): string | null {
  const test = tests.get(testId);
  if (!test) return null;
  test.requestCount++;
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < test.models.length; i++) {
    cumulative += test.weights[i];
    if (r <= cumulative) {
      const model = test.models[i];
      test.modelCounts[model] = (test.modelCounts[model] || 0) + 1;
      return model;
    }
  }
  return test.models[0];
}

export function getABTestStats() {
  const result: Record<string, ABTest> = {};
  for (const [id, t] of tests) {
    result[id] = { ...t, weights: t.weights.map(w => Math.round(w * 100) + "%") as unknown as number[] };
  }
  return result;
}

export function deleteABTest(id: string) {
  tests.delete(id);
}
