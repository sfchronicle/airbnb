'use strict';

jQuery.ajaxSetup({ cache: false });

var App = App || {};

/*  =================================================
    UTILITIES
    =================================================
*/
App.Utils = App.Utils || {};
App.Utils.slugify = function (text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
};
App.Utils.templatize = function (template, placeholder, obj) {
  /*  Handlebars template selector, placehodler selector, data object
      Render Handlebars template
  */
  var source = $(template).html(),
      hbs = Handlebars.compile( source );

  $(placeholder).html( hbs( obj ) );
};

/*  =================================================
    MAP
    =================================================
*/
App.Nav = App.Nav || {};
App.Nav.load = function () {
  $('.sfc-history').on('click', function (event) {

    event.preventDefault();
    var chapterId = $(event.target).data('chapterId');
    App.Story.triggerGotoNextClick( chapterId );
  });
};

/*  =================================================
    MAP
    =================================================
*/
App.Map = App.Map || {
  width: 1000,
  height: 600,
  coordinates: [-122.50, 37.7520],
  rendered: false,
  currentId: 'avgOfPrice' // This acts as the default view for the choropleth
};

App.Map.load = function () {
  var self = this;
  var slugify =  App.Utils.slugify;
  var templatize = App.Utils.templatize;
  var layers = ['water', 'landuse', 'roads', 'buildings'];
  var tiler = d3.geo.tile()
      .size([self.width, self.height]);

  var projection = d3.geo.mercator()
      .center(self.coordinates)
      .scale((1 << 20) / 2 / Math.PI)
      .translate([self.width / 2, self.height / 2]);

  var path = d3.geo.path()
      .projection(projection);

  var tip = d3.tip()
      .attr('class', 'map-tooltip')
      .html(createTooltip);

  var svg = d3.select('#map').append('div').classed('svg-container', true)
        .append('svg')
          .attr('viewBox', '0 0 '+self.width+' '+self.height)
          .attr('preserveAspectRatio', 'xMidYMid')
          .classed('svg-content-responsive', true)

  svg.call(tip)
    .call(renderTiles)
    .call(renderTopojson)
    .call(renderLegend)
    //.call(renderCredits);

  function createTooltip (d) {
    if (!App.Map.currentId) { return d.properties.name; }
    var data = {
      'name': d.properties.name,
      2014: self.addAllProperties(d, App.Map.currentId, 2014).total,
      2015: self.addAllProperties(d, App.Map.currentId, 2015).total
    }

    var source = $('#tooltip-tmpl').html();
    var template = Handlebars.compile( source );
    return template( data );
  };

  function adjustChoroplethEvent () {
    $('.sfc-data-button').on('click', function (event) {
      event.preventDefault();
      var id = event.target.id;
      App.Map.currentId = id;

      self.choropleth(svg, path, id);
      templatize('#legend-tmpl', '.legend', self.legendCopy( id ));
      self.createlegend( id );
      adjustChoroplethEvent(); // Reattaches events to new template
      $('.sfc-data-button').removeClass('active');
      $('.sfc-data-button#'+id).addClass('active');
    });
  }

  function renderLegend (svg) {
    var defaultId = 'avgOfPrice';

    d3.selectAll('.svg-container')
      .append('div').attr('class', 'row')
        .append('div')
          .attr('class', 'legend large-4 large-offset-0 small-3 small-offset-1 columns');

    templatize('#legend-tmpl', '.legend',  self.legendCopy( defaultId ));
    adjustChoroplethEvent();
    $('.sfc-data-button#'+defaultId).addClass('active');
  }

  function renderTiles (svg) {
    /* Hit Mapzen Vector Tile API for map data */
    svg.selectAll('g')
        .data(
          tiler.scale(projection.scale() * 2 * Math.PI)
          .translate(projection([0, 0]))
        )
      .enter().append('g')
        .each(function (d) {
          var g = d3.select(this);
          d3.json("http://vector.mapzen.com/osm/all/" + d[2] + "/" + d[0] + "/" + d[1] + ".json?api_key=vector-tiles-ZS0fz7o", function(error, json) {

            layers.forEach(function (layer) {
              var data = json[layer];

              if (data) {
                g.selectAll('path')
                    .data(data.features.sort(function(a, b) { return a.properties.sort_key - b.properties.sort_key; }))
                  .enter().append('path')
                    .attr('class', function (d) { return d.properties.kind; })
                    .attr('d', path);
              }
            });
          });
        });
  }

  function renderTopojson (svg) {
    /* Render topojson of SF Airbnb neighborhoods
       Converted from KML for John Blanchard */
    function build (json) {
      // render neighborhoods on map
      svg.append('g').selectAll('path')
        .data(topojson.feature(json, json.objects.neighborhoods).features)
      .enter().append('path')
        .attr('class', 'neighborhood')
        .attr('id', function (d) { return slugify(d.properties.name); })
        .attr('d', path)
        .on('mouseover', tip.show)
        .on('mouseout', tip.hide)
        .on('click', function (d) { console.log(d); alert('Implement a click event') });
    }

    // Checking for cached JSON to keep network trips down
    if (!App.jsonCache) {
      d3.json('/static/2015-07-02-sf-neighborhoods-airbnb.topojson', function (error, json) {
        if (error) { console.error(error); return error; }
        App.jsonCache = json;
        build( json );
        self.choropleth(svg, path, 'avgOfPrice'); // KICK OFF
      });
    } else {
      build( App.jsonCache );
      self.choropleth(svg, path, 'avgOfPrice'); // KICK OFF
    }
  }

  function renderCredits (svg) {
    /* Credits for map */
    d3.selectAll('.svg-container').append('span')
      .attr('id', 'map-credits')
      .text('Credits: Aaron Williams, John Blanchard and Maegan Clawges | Source: Connotate');
  }
};

App.Map.choropleth = function (svg, path, id) {
  /* Creat choropleth map based on data Id */
  var self = this;

  var scale     = self.generateScales( id );
  var scaletype = id === 'avgOfPrice' ? 'quantize' : 'quantile';

  d3.selectAll('.neighborhood')
    .attr('class', function (d) { return scale( self.addAllProperties( d, id, 2015 ).total ) + ' neighborhood'; })
    .attr('d', path);

  self.createlegend( 'avgOfPrice' );
};

App.Map.createlegend = function (id) {
  $('#map-legend').html('');
  var self = this;
  //var scaleLength = 8;
  //var scaletype   = id === 'avgOfPrice' ? 'quantize' : 'quantile';

  var legend = d3.select('#map-legend').append('ul')
      .attr('class', 'inline-list');

  var colors = self.generateScales(id, true);

  // var colors = d3.scale.quantize()
  //   .range(range);

  var keys = legend.selectAll('li.key')
    .data(colors.range());

  keys.enter().append('li')
    .attr('class', 'key')
    .attr('id', id)
    .style('border-bottom-color', String)
    .text(function (d) {
      var r       = colors.invertExtent(d),
          lowEnd  = Math.floor(r[0]), //Math.floor(r[0] * 100),
          highEnd = Math.floor(r[1]); //Math.floor(r[1] * 100);

      return lowEnd+' - '+highEnd;
    });
};

App.Map.generateScales = function (id, forLegend) {
  var forLegend = forLegend || false;
  /* Given an ID, generate a scale */
  var scale;
  var self = this;
  var scaleLength = 8;

  var legendRange = ['rgb(255,255,204)', 'rgb(255,237,160)', 'rgb(254,217,118)', 'rgb(254,178,76)', 'rgb(253,141,60)', 'rgb(252,78,42)', 'rgb(227,26,28)', 'rgb(177,0,38)'],
      mapRange = d3.range(scaleLength).map(function (i) { return 'q'+i+'-'+scaleLength }),
      range = forLegend ? legendRange : mapRange;

  var neighborhoods = App.jsonCache.objects.neighborhoods.geometries;

  var domain = _.chain(neighborhoods)
      .map(function (neighborhood) { return self.addAllProperties( neighborhood, id, 2015 ).total; })
      .sortBy(function (value) { return value; })
      .value();

  var map = {
    'avgOfPrice': function () {
      var _topHood    = _.max(neighborhoods, function (n) { return self.addAllProperties(n, id, 2015 ).total; }),
          _bottomHood = _.min(neighborhoods, function (n) { return self.addAllProperties(n, id, 2015 ).total; });

      var min = self.addAllProperties(_bottomHood, id, 2015).total,
          max = self.addAllProperties(_topHood, id, 2015).total;

      scale = d3.scale.quantize()
        .domain([min, max])
        .range(range);
    },
    'locationsCount': function () {
      scale = d3.scale.quantile()
        .domain(domain)
        .range(range);
    },
    'reviewCount': function () {
      scale = d3.scale.quantile()
        .domain(domain)
        .range(range);
    }
  };

  var thisScale = map[id];
  if (thisScale) { thisScale(); return scale; }
}

App.Map.addAllProperties = function (d, id, year) {
  /* Sum the values of an id type */
  var total      = 0.0;
  var properties = ['entireHome', 'privateRoom', 'sharedRoom'];

  properties.forEach(function (property) {
    total += d.properties[property][id][year]
  });

  if (id === 'avgOfPrice') { total = total / 3 }

  return {'neighborhood': d.properties.name, 'property': id, 'total': total};
};

App.Map.legendCopy = function (id) {
  var map = {
    'avgOfPrice': function () {
      var copy = {};
      copy.hed = 'Average price'
      copy.dek = 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.';
      copy.id = 'avgOfPrice';
      return copy;
    },
    'locationsCount': function () {
      var copy = {};
      copy.hed = 'Total locations';
      copy.dek = 'My woes, This is that nasty flow, Way way way up, They need the whole thing, The shit was gettin‘ too predictable, You know they all sentimental now.';
      copy.id = 'locationsCount';
      return copy;
    },
    'reviewCount': function () {
      var copy = {};
      copy.hed = 'Total reviews';
      copy.dek = 'Tousled forage chillwave, lomo Williamsburg twee mlkshk semiotics try-hard gastropub. Cred PBR messenger bag Etsy skateboard, dreamcatcher scenester 8-bit locavore.';
      copy.id = 'reviewCount';
      return copy;
    }
  };

  var thisScale = map[id];
  if (thisScale) { return thisScale(); }
}

/*  =================================================
    STORY
    =================================================
*/
App.Story = App.Story || {
  canScroll:          true,
  initialLoad:        true,
  animationDuration:  500,
  postCount:          5,
  currentPostIndex:   1,
  postCache:          {},
  pageTemplate:       null,
};

App.Story.load = function () {

  this.currentPostIndex = getURLIndex();
  this.makeSelections();

  $body.append( this.$current );
  $body.append( this.$next );

  var self = this;
  this.createPost({ type: 'current' }, function () {
    self.createPost({ type: 'next' }, function () {

      /* Selections. */
      self.refreshCurrentAndNextSelection();

      /* Push initial on to stack */
      window.history.pushState(pageState(), '', '#' + self.currentPostIndex)

      /* Bind to some events. */
      self.bindGotoNextClick();
      self.bindPopstate();
      self.bindWindowScroll();
    });
  });
}

App.Story.makeSelections = function () {
  this.$page         = $('.page');
  this.pageTemplate  = elementToTemplate( this.$page.clone() );
  this.$current      = this.currentElementClone();
  this.$next         = this.nextElementClone();
}

App.Story.getPost = function (index, callback) {
  callback = callback || $.noop;

  if ( this.postCache[index] ) {
    callback( this.postCache[index] );
    return;
  }

  var self = this;
  //console.log("b" + index);
  $.getJSON('/static/stories/post_'+ index +'.json', function (d) {
    self.postCache[index] = d;
    callback(d);
  });
}

App.Story.nextPostIndex = function (index) {
  return (index === this.postCount) ? 1 : index + 1;
}

App.Story.createPost = function(opts, callback){
  opts      = opts || {};
  var self  = this;
  var type  = opts['type'] || 'next';

  if ( opts['fromTemplate'] ) {
    $body.append( this.nextElementClone() );
    this['$' + type] = $('.' + type)
  }

  var index = (type == 'next') ? this.nextPostIndex( this.currentPostIndex) : this.currentPostIndex;
  //console.log("a" + index);
  this.getPost(index, function (d) {
    self.contentizeElement(self['$' + type], d);
    callback && callback();
  });

  if (this.currentPostIndex === 1) {
    App.Map.load();
  }
}

App.Story.contentizeElement = function ($el, d) {
  $el.find('.big-image').css({ backgroundImage: "url(" + d.image + ")" });
  $el.find('h1.title').html(d.title);

  if ($el.hasClass('next')) {
    var $button = $('.button.next-story');
    $button.removeClass('blue pink yellow');

    $button.find('h3').html(d.title);
    $button.addClass(d.color);
  }

  $el.find('h2.description').html(d.title_secondary);
  if (d.intro) { $el.find('.content #sfc-row').html(App.Story.createDropCap(d.intro, d.color)); }
  $el.find('.content .text-primary').html(d.content);
  $el.find('.content .breakout_content').html(d.breakout_content);
  if (d.content_secondary) { $el.find('.content .text-secondary').html(d.content_secondary); }
  if (d.content_tertiary) { $el.find('.content .text-tertiary').html(d.content_tertiary); }
  $el.find('.sfc-byline').html(d.author);
  if (d.photos) { $el.find('.body-pic').html(App.Story.formatPhotos(d.photos, d.caption, d.color)); }
  if (d.side_content) { $el.find('.side-content').html('<img src="' + d.side_content + '"  data-src="'+ d.side_content +'">'); }

  $('img').unveil(); // For lazy loading
}

App.Story.createDropCap = function (text, color) {
  var cap       = text.substring(0,1);
  text          = text.substring(1, text.length);
  var introHTML = '<div class="sfc-intro ' + color + '"><div class="drop-cap component"><ul class="grid"><li class="ot-letter-left ' + color + '-letter"><span data-letter="' + cap + '" class="' + cap + '">' + cap + '</span></li></ul></div><div class="intro-text text">' + text + '</div></div>';
  return introHTML;
}

App.Story.formatPhotos = function (photos, caption, color) {
  var photoHTML   = "";
  if (photos.length === 1) {
    photoHTML    += '<img class="small-10 small-offset-1" src="' + photos[0] + '">';
    photoHTML    += '<h3 class="photo-header ' + color + ' small-12 medium-10 medium-offset-1 columns left">' + caption + '</h3>';
  } else if (photos.length == 2) {
    photoHTML    += '<img class="small-10 small-offset-1 medium-5 columns" src="' + photos[0] + '" data-src="'+photos[0]+'">';
    photoHTML    += '<img class="small-10 small-offset-1 medium-5 medium-offset-0 columns" src="' + photos[1] + '" data-src="'+photos[1]+'">';
    photoHTML    += '<h3 class="small-10 small-offset-1 columns left photo-header ' + color + '">' + caption + '</h3>';
  } else if (photos.length == 3) {
    photoHTML    += '<div class="multi-pic small-12 medium-4 columns"><img src="' + photos[1] + '" data-src="'+photos[1]+'">';
    photoHTML    += '<img class="vertical-align" src="' + photos[2] + '" data-src="'+photos[2]+'"></div>';
    photoHTML    += '<div class="small-12 medium-8 columns"><img src="' + photos[0] + '" data-src="'+photos[0]+'"></div>';
    photoHTML    += '<h3 class="row small-12 columns left photo-header ' + color + '">' + caption + '</h3>';
  }
  return photoHTML;
}

App.Story.animatePage = function(callback){
  var self              = this;
  var translationValue  = this.$next.get(0).getBoundingClientRect().top;
  this.canScroll        = false;

  this.$current.addClass('fade-up-out');

  this.$next.removeClass('content-hidden next')
       .addClass('easing-upward')
       .css({ "transform": "translate3d(0, -"+ translationValue +"px, 0)" });

  setTimeout(function(){
      scrollTop();
      self.$next.removeClass('easing-upward')
      self.$current.remove();

      self.$next.css({ "transform": "" });
      self.$current = self.$next.addClass('current');

      self.canScroll = true;
      self.currentPostIndex = self.nextPostIndex( self.currentPostIndex );

      callback();
  }, self.animationDuration );
}

App.Story.gotoNextClick = function () {
  var self = this;
  self.animatePage(function(){

    self.createPost({ fromTemplate: true, type: 'next' });
    self.bindGotoNextClick();
    window.history.pushState( pageState(), '', "#" + self.currentPostIndex);
    $(".sfc-head").fadeIn();
  });
};

App.Story.triggerGotoNextClick = function (chapterId) {
  // var self = this;
  // this.currentPostIndex = parseInt(chapterId);
  //
  // self.animatePage(function(){
  //   self.createPost({ fromTemplate: true, type: 'current' });
  //   self.bindGotoNextClick();
  //   window.history.pushState( pageState(), '', "#" + chapterId);
  // });
  console.info('Ideally, this would go to chapter', chapterId);
};

App.Story.bindGotoNextClick = function(){
  var self  = this;
  var e     = 'ontouchstart' in window ? 'touchstart' : 'click';

  this.$next.find('.big-image').on(e, function(e){
    e.preventDefault();
    $(this).unbind(e);
    self.gotoNextClick();
  });
};

App.Story.bindPopstate = function(){
  var self = this;
  $window.on('popstate', function(e){

    if( !history.state || self.initialLoad ){
      self.initialLoad = false;
      return;
    }

    self.currentPostIndex = history.state.index;
    self.$current.replaceWith( history.state.current );
    self.$next.replaceWith( history.state.next );

    self.refreshCurrentAndNextSelection();
    self.createPost({ type: 'next' });
    self.bindGotoNextClick();
  });
}

App.Story.bindWindowScroll = function(){
  var self = this;
  $window.on('mousewheel', function(ev){
    if ( !self.canScroll )
      ev.preventDefault()
  })
}

App.Story.refreshCurrentAndNextSelection = function(){
  this.$current      = $('.page.current');
  this.$next         = $('.page.next');
}

App.Story.nextElementClone = function(){
  return this.$page.clone().removeClass('hidden').addClass('next content-hidden');
}

App.Story.currentElementClone = function(){
  return this.$page.clone().removeClass('hidden').addClass('current');
}


function elementToTemplate($element){
  return $element.get(0).outerHTML;
}

function scrollTop(){
  $body.add($html).scrollTop(0);
}

function pageState(){
  return { index: App.Story.currentPostIndex, current: elementToTemplate(App.Story.$current), next: elementToTemplate(App.Story.$next) }
}

function getURLIndex(){
  return parseInt( (history.state && history.state.index) ||window.location.hash.replace('#', "") || App.Story.currentPostIndex );
}
