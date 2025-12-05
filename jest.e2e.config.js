export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node', // Puppeteer runs in node
    roots: ['<rootDir>/tests/e2e'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
            },
        ],
    },
    testTimeout: 30000, // Longer timeout for browser operations
};
