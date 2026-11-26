// Local API for development and tests: same handler as production, files in ./.data (or SIPSTREAK_DATA_DIR).
import http from 'node:http'
import handler from '../api/[...path].js'

const port = Number(process.env.PORT || 4000)
http.createServer((req, res) => handler(req, res)).listen(port, () => console.log(`SipStreak API on http://localhost:${port}`))
