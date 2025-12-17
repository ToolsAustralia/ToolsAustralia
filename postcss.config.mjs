/**
 * PostCSS Configuration
 * 
 * Autoprefixer automatically uses .browserslistrc file (if present) to determine
 * which browsers to support and which vendor prefixes to generate.
 * 
 * Browser targets are defined in .browserslistrc at the project root.
 * This ensures consistent prefix generation across all build tools.
 */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {
      // Autoprefixer will automatically read .browserslistrc file
      // No explicit configuration needed - it uses browserslist by default
    },
  },
};

export default config;
