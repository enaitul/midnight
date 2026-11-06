import { inspect } from 'node:util'
import { build } from 'vite'

try {
  await build()
} catch (error) {
  console.error('Vite build failed.')
  console.error('Complete error:')
  console.error(inspect(error, { depth: null, colors: false }))

  try {
    if (error != null && 'errors' in Object(error)) {
      console.error('error.errors:')
      console.error(inspect(error.errors, { depth: null, colors: false }))
    }
  } catch (inspectionError) {
    console.error('Unable to inspect error.errors:')
    console.error(inspect(inspectionError, { depth: null, colors: false }))
  }

  try {
    if (error != null && 'cause' in Object(error) && error.cause !== undefined) {
      console.error('error.cause:')
      console.error(inspect(error.cause, { depth: null, colors: false }))
    }
  } catch (inspectionError) {
    console.error('Unable to inspect error.cause:')
    console.error(inspect(inspectionError, { depth: null, colors: false }))
  }

  if (error?.stack) {
    console.error('Complete stack trace:')
    console.error(error.stack)
  }

  process.exitCode = 1
}
