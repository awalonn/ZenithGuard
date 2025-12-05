export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/tests'],
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
};
