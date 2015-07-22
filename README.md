# Airbnb Project Build
A look at Airbnb in San Francisco.

### Requirements
- Python 2.7.x
- Node.js 0.12
  - uglifyjs (`npm install -g uglifyjs`)
  - clean-css (`npm install -g cleancss`)
  - Bower and Grunt (`$ npm install -g grunt-cli bower`)

### Installation
```bash
$ git clone git@github.com:sfchronicle/airbnb.git && cd $_
$ mkvirtualenv airbnb
$ pip install -r requirements.txt && npm install && bower install
$ grunt serve
```

### Build and deployment
Create a `local_settings.py` file in the `settings` directory. Add the following env variables:
```python
AWS_ACCESS_KEY_ID = ''
AWS_SECRET_ACCESS_KEY = ''
````

Now run `build.py` to compress assets for production and upload production files to Amazon S3
```bash
$ python build.py
```

## Building the map
- Download [John Blanchard's Neighborhoods](https://s3-us-west-1.amazonaws.com/sfchronicle/SF+neighborhoods+for+Air+BnB+2015.kml) (.kml file)
  - Convert the .kml file to a shapefile using QGIS
    - http://www.igismap.com/convert-kml-shapefile-qgis/
  - Combine the exported files in a .zip file, upload to [Shape Escape](http://shpescape.com/) and conver to GeoJSON.
- Extract the Combine the following files into a single topojson file:

```bash
$ topojson \
  -o sf.topojson \
  -- \
  bayarea_general.json \
  RPD_Parks.json \
  sfpresidio.json \
  stclines_streets.json \
  sf-neighborhoods-jblanchard.json
```
Test
