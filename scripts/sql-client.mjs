import { readFileSync } from 'node:fs'
import pg from 'pg'

// This client lives in the readonly checker container, outside the database OS.
const client=new pg.Client({host:'127.0.0.1',port:5432,database:'postgres',user:'postgres',password:'qa-disposable',
  connectionTimeoutMillis:5000,query_timeout:25000,statement_timeout:20000,lock_timeout:15000})
try {
  await client.connect()
  const results=await client.query(readFileSync(0,'utf8'))
  console.log(JSON.stringify((Array.isArray(results)?results:[results]).map(r=>r.rows)))
} catch(error) {
  console.error(JSON.stringify({code:error.code,message:error.message}))
  process.exitCode=1
} finally { await client.end() }
