#!/bin/bash
sqlite3 ../database/uploadData.db <<EOF
delete from open_rooms;
delete from uploaded_files;
.quit 
EOF