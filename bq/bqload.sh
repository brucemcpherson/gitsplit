#!/bin/bash
# created by  - all the apps script project details
# splitgit
JSON=$1
LOADID=$2
if [ -z LOADID ]; then
  echo "param 2 should be loadid"
  exit 1
fi
if [ -z JSON ]; then
  echo "param 1 should be input file"
  exit 1
fi

# my public dataset
DS="gassypedia"

# split the scrgit json
COLLECTIONS=(
 'libraries' 'files' 'owners' 'repos'
)

GOOD=0
BAD=0

for c in "${COLLECTIONS[@]}"
do
  echo ""
  echo "----working on collection ${c}----"
  TEMP=$(mktemp)

  # convert to ndjson and split into separate tables
cat "${JSON}"  | \
  sed "s/\$ref/ref/g" | \
  sed "s/HomepageTrigger/homepageTrigger/g" | \
  sed "s/\$comment/comment/g" | \
  sed "s/\$id/id/g" | \
  sed "s/\$schema/schema/g" | \
  sed "s/addonUrl/addOnUrl/g" | \
  sed 's/\"\/\/\"/\"slashes\"/g' | \
  sed  "s/{}/null/g" | \
  jq ".${c}[] |= (.loadId=${LOADID})" | \
  jq -c ".${c} | .[]" | \
  sed -E "s/\[null\]/null/g" | \
  jq -c "del(.content.extends,.content.parserOptions,.content.rules)" > "${TEMP}"

  #bq query "delete from ${DS}.${c} where loadId = ${LOADID}"

  bq --location=us load \
  --autodetect \
  --source_format=NEWLINE_DELIMITED_JSON \
  "${DS}.${c}" \
  "${TEMP}" \
  "./schemas/${c}.json"

  if [ $? -ne 0 ]; then
    echo "ERROR - failed on collection ${c}"
    let "BAD++"
  else 
    echo "...finished on collection ${c}"
    let "GOOD++"
  fi
  rm ${TEMP}
done


echo ""
echo "----all done----"
echo "loaded ${GOOD} from ${#COLLECTIONS[@]} collections from scrgit to bigquery"
if [ $BAD -ne 0 ]; then
  echo "ERROR there were ${BAD} failures"
  exit 88
else
  exit 0
fi

