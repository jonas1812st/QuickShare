#!/bin/bash
sqlite3 ../database/uploadData.db <<EOF
select * from open_rooms;
select * from uploaded_files;
.quit
EOF