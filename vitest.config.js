// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Set a generous timeout for the global setup/teardown hooks themselves.
        // This is important because starting a server can be slow.
        hookTimeout: 60000, // 60 seconds

        // A default timeout for individual tests
        testTimeout: 25000, // 20 seconds

        // Tell Vitest where to find your global setup and teardown files
        globalTeardown: './test/globalTeardown.js'
    }
});