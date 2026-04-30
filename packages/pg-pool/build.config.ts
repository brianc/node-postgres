import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [{ type: 'transform', input: './src', outDir: './dist', dts: true }],
})
