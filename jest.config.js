export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  testMatch: [
    "<rootDir>/tests/unit/**/*.test.[jt]s",
    "<rootDir>/tests/integration/**/*.test.[jt]s"
  ],
  moduleFileExtensions: ["js", "ts", "json", "svelte"],
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
