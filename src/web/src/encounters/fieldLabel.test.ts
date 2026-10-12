import { describe, expect, it } from 'vitest'
import { describeImportField } from './fieldLabel'

describe('describeImportField', () => {
  it('counts list entries from 1 and keeps the path', () => {
    expect(describeImportField('layout.cells[12]')).toBe(
      'Feld 13 in der Liste der Felder (layout.cells[12])',
    )
    expect(describeImportField('creatures[0]')).toBe(
      'Kreatur 1 in der Liste der Kreaturen (creatures[0])',
    )
  })

  it('names the entry for paths deeper inside it', () => {
    expect(describeImportField('layout.entrances[1].cells[0]')).toBe(
      'Eingang 2 in der Liste der Ein- und Ausgänge (layout.entrances[1].cells[0])',
    )
  })

  it('names plain fields and passes unknown paths through', () => {
    expect(describeImportField('width')).toBe('Breite (width)')
    expect(describeImportField('somethingElse')).toBe('somethingElse')
  })
})
