LOADID=$1
if [ -z LOADID ]; then
  echo "param 1 should be loadid"
  exit 1
fi
bash bqload.sh ../data/loads/${LOADID}-final.json ${LOADID}