- goto github developer settings - personal tokens and generate new gitsplit pat
- update that in cloud consolesecrets for scrmin project 
- rerun ../shells/getsecrets.sh
- node omerge.mjs to recreate the archive file
- node gitsplit.mjs -a ../data/loads/archive.json -n ../data/loads/250105.json
- node libfix.mjs  -n ../data/loads/250404.json -o ../data/loads/250404-final.json
in bigquery insert load date
bash bqsh.sh 250404

````
{
    "gitConfigs": {
        "gitAuth": "xxx"
    }}
````

