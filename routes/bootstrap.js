const express = require('express')
const router = express.Router()

// Commononly used symbols in specifying a song's key signature.
const MUSIC_SYMBOLS = {
  flatSign: {
    char: '♭',
    hex: '266D',
    // css: '\266D',
    html: '&#9837;',
    entity: '&flat;'
  },
  naturalSign: {
    char: '♮',
    hex: '266E',
    // css: '\266E',
    html: '&#9838;',
    entity: '&natural;'
  },
  sharpSign: {
    char: '♯',
    hex: '266F',
    // css: '\266F',
    html: '&#9839;',
    entity: '&sharp;'
  }
}

Object.freeze(MUSIC_SYMBOLS)

const allLetters = 'ABCDEFG'.split('')
const flatable = 'ABDEG'.split('')
const sharpable = 'ACDFG'.split('')

const KEY_SIGNATURES = allLetters.reduce((memo, BaseKey) => {
  const result = []
  if (flatable.includes(BaseKey)) {
    result.push(`${BaseKey}${MUSIC_SYMBOLS.flatSign.char}`)
    result.push(`${BaseKey}${MUSIC_SYMBOLS.flatSign.char}m`)
  }

  result.push(BaseKey)
  result.push(BaseKey + 'm')

  if (sharpable.includes(BaseKey)) {
    result.push(`${BaseKey}${MUSIC_SYMBOLS.sharpSign.char}`)
    result.push(`${BaseKey}${MUSIC_SYMBOLS.sharpSign.char}m`)
  }

  return [...memo, ...result]
}, [])

Object.freeze(KEY_SIGNATURES)

router.get('/', (req, res, next) => {
  res.json({
    keySignatures: KEY_SIGNATURES
  })
})

module.exports = router
