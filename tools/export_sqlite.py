"""Offline export from a verified SQLite backup; the resulting JSON contains private capabilities."""
import json,sqlite3,sys,os
from pathlib import Path
if len(sys.argv)!=3:raise SystemExit('Usage: python3 tools/export_sqlite.py BACKUP.sqlite PRIVATE_EXPORT.json')
with sqlite3.connect('file:'+str(Path(sys.argv[1]).resolve())+'?mode=ro',uri=True) as db:
 db.row_factory=sqlite3.Row
 data={table:[dict(row) for row in db.execute('SELECT * FROM '+table)] for table in ['workspaces','sessions','api_keys','runs','reviews','audit','counters']}
fd=os.open(sys.argv[2],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as out:json.dump(data,out,separators=(',',':'))
print({k:len(v) for k,v in data.items()})
