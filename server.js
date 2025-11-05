import { runCommand } from '@nuxt/cli'

async function main() {
  const argv = [...process.argv.slice(2)]

  if (!argv.includes('--port') && process.env.PORT) {
    argv.push('--port', process.env.PORT)
  }

  if (!argv.includes('--host') && process.env.HOST) {
    argv.push('--host', process.env.HOST)
  }

  try {
    await runCommand('dev', argv, {
      overrides: {
        cwd: process.cwd()
      }
    })
  }
  catch (error) {
    console.error('Failed to start Nuxt dev server:', error)
    process.exit(1)
  }
}

main()
