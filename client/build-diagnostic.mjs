import { writeSync } from 'node:fs'
import { inspect } from 'node:util'
import { build } from 'vite'

try {
  await build()
} catch (error) {
  const diagnostics = ['Vite build failed.', 'Complete error:', inspect(error, { depth: null, colors: false })]

  try {
    if (error != null && 'errors' in Object(error)) {
      diagnostics.push('error.errors:', inspect(error.errors, { depth: null, colors: false }))
    }
  } catch (inspectionError) {
    diagnostics.push('Unable to inspect error.errors:', inspect(inspectionError, { depth: null, colors: false }))
  }

  try {
    if (error != null && 'cause' in Object(error) && error.cause !== undefined) {
      diagnostics.push('error.cause:', inspect(error.cause, { depth: null, colors: false }))
    }
  } catch (inspectionError) {
    diagnostics.push('Unable to inspect error.cause:', inspect(inspectionError, { depth: null, colors: false }))
  }

  if (error?.stack) {
    diagnostics.push('Complete stack trace:', error.stack)
  }

  writeSync(2, `${diagnostics.join('\n')}\n`)
  process.exitCode = 1
}
