from flask import render_template  #, redirect, url_for

from app import app, db
from models import *


@app.route('/index.html')
def index():
    return render_template('index.html', title='index')
