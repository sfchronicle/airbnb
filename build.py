from flask.ext.frozen import Freezer
from app import app, assets
from views import *

freezer = Freezer(app)

if __name__ == '__main__':
    app.config['DEBUG'] = False
    app.config['ASSETS_DEBUG'] = False
    app.config['FREEZER_RELATIVE_URLS'] = True
    freezer.freeze()
