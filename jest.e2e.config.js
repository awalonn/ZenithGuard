export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/e2e"],
  testMatch: ["<rootDir>/tests/e2e/**/*.test.[jt]s"],
  setupFilesAfterEnv: ["<rootDir>/tests/e2e/setup.ts"],
  moduleFileExtensions: ["js", "ts", "json"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.json"
      }
    ]
  }
};
