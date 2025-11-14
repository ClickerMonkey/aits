# @aits/cletus

Interactive CLI demo showcasing AITS capabilities with autonomous operation support.

## Configuration

Cletus stores its configuration in `~/.cletus/config.json`. You can customize various settings including autonomous operation limits.

### Autonomous Operation Settings

Control how long and how many iterations Cletus can run autonomously without human interaction:

```json
{
  "user": {
    "autonomous": {
      "maxIterations": 10,
      "timeoutMs": 300000
    }
  }
}
```

**Settings:**

- `maxIterations` (number, default: 10): Maximum number of autonomous loop iterations before requiring human approval. Must be at least 1.
- `timeoutMs` (number, default: 300000): Maximum time in milliseconds (5 minutes) for autonomous operations before timing out. Must be at least 1000ms (1 second).

These settings help ensure that Cletus doesn't run indefinitely and requires periodic human interaction for safety and control.

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for development instructions.
