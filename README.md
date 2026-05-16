# sellsy-mcp

MCP server exposing the [Sellsy](https://www.sellsy.com/) CRM API (v2) as Model Context Protocol tools.

## Install

```bash
# Run directly via GitHub (Paperclip / Claude Code agents):
npx -y github:healdigital/sellsy-mcp
```

## Configuration

Set `SELLSY_CLIENT_ID` and `SELLSY_CLIENT_SECRET` in env. Generate them from
Sellsy → Settings → API → OAuth2 credentials.

```jsonc
{
  "mcpServers": {
    "sellsy": {
      "command": "npx",
      "args": ["-y", "github:healdigital/sellsy-mcp"],
      "env": {
        "SELLSY_CLIENT_ID": "<id>",
        "SELLSY_CLIENT_SECRET": "<secret>"
      }
    }
  }
}
```

## Tools

Exposes the full Sellsy v2 surface: companies, contacts, individuals,
opportunities, estimates, invoices, credit notes, orders, payments, items,
calendar events, tasks, comments, custom fields, smart tags, webhooks, search.

## License

ISC — see `package.json`.
