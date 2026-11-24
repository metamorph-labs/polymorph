import { serve } from './serve'

/**
 * `polymorph-mcp`, the published MCP server over stdio: the checkout's
 * `polymorph-mcp`, with the registry and the files this package ships. Point an
 * MCP client at `npx -y @metamorph-labs/polymorph@<range> mcp`, or at this bin
 * where the package is installed.
 */
await serve('polymorph-mcp', process.argv.slice(2))
