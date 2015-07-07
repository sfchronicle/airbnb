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
App.Map = App.Map || {
  width: 1000,
  height: 600,
  coordinates: [-122.4883, 37.7520],
  rendered: false
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
      .attr('class', 'd3-tip')
      .html(function(d) { return d.properties.name; });

  var svg = d3.select('#map').append('div').classed('svg-container', true)
        .append('svg')
          .attr('viewBox', '0 0 '+self.width+' '+self.height)
          .attr('preserveAspectRatio', 'xMidYMid')
          .classed('svg-content-responsive', true)

  svg.call(tip)
    .call(renderTiles)
    .call(renderTopojson)
    .call(renderLegend)
    .call(renderCredits);

  function generateScales (id) {
    /* Given an ID, generate a scale */
    var scale;
    var scaleLength = 8;
    var neighborhoods = App.jsonCache.objects.neighborhoods.geometries;
    var _topHood = _.max(neighborhoods, function (neighborhood) { return addAllProperties( neighborhood, id, 2015 ).total; });
    var _bottomHood = _.min(neighborhoods, function (neighborhood) { return addAllProperties( neighborhood, id, 2015 ).total; });

    var min = addAllProperties(_bottomHood, id, 2015).total
    var max = addAllProperties(_topHood, id, 2015).total

    console.info(id, 'min:', min, 'max:', max);

    scale = d3.scale.quantize()
      .domain([min, max])
      .range(d3.range(scaleLength).map(function (i) { return 'q'+i+'-'+scaleLength }));

    return scale;
  }

  function addAllProperties (d, id, year) {
    var total      = 0.0;
    var properties = ['entireHome', 'privateRoom', 'sharedRoom'];

    properties.forEach(function (property) {
      total += d.properties[property][id][year]
    });

    if (id === 'avgOfPrice') { total = total / 3 }

    return {'neighborhood': d.properties.name, 'property': id, 'total': total};
  };

  function renderLegend (svg) {

    d3.selectAll('.svg-container')
      .append('div').attr('class', 'row')
        .append('div')
          .attr('class', 'legend large-4 large-offset-0 small-3 small-offset-1 columns');

    templatize('#legend-tmpl', '.legend',  {});

    $('.sfc-data-button').on('click', function (event) {

      event.preventDefault();
      var id = event.target.id;
      var quantize = generateScales( id );

      svg.selectAll('.neighborhood')
        .attr('class', function (d) {
          var data = addAllProperties( d, id, 2015 ).total;
          return quantize(data) + ' neighborhood'
        })
        .attr('d', path);
    });
  }

  function renderTiles (svg) {
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
        .on('click', self.render);
    }

    // Checking for cached JSON to keep network trips down
    if (!App.jsonCache) {
      d3.json('/static/2015-07-02-sf-neighborhoods-airbnb.topojson', function (error, json) {
        if (error) { console.error(error); return error; }
        App.jsonCache = json;
        build( json );
      });
    } else {
      build( App.jsonCache );
    }
  }

  function renderCredits (svg) {
    d3.selectAll('.svg-container').append('span')
      .attr('id', 'map-credits')
      .text('Credits: Aaron Williams, John Blanchard and Maegan Clawges | Source: Connotate');
  }
  /*  =================
      Function for rendering neighborhoods defined by the city
      =================
  */
  // function renderSF (svg) {
  //   d3.json('/static/data/sf-neighborhoods.json', function (error, json) {
  //     svg.append('g').selectAll('path')
  //       .data(json.features)
  //     .enter().append('path')
  //       .attr('class', 'neighborhood')
  //       .attr('id', function (d) { return slugify(d.properties.neighborho); })
  //       .attr('d', path);
  //   });
  // }
};

App.Map.render = function (d) {
  /* Click event for neighborhood. Render template
    these are paths so remember that typicall jQuery functions won't work
  */
  var t = App.Utils.templatize;
  var id = App.Utils.slugify( d.properties.name );

  d3.selectAll('.neighborhood').classed('active', false);
  d3.selectAll('.neighborhood#'+id).classed('active', true);

  t('#legend-tmpl', '.legend', d.properties);
};

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
      history.pushState(pageState(), '', '#' + self.currentPostIndex)

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
  $el.find('h2.description').html(d.title_secondary);
  if (d.intro) { $el.find('.content .sfc-intro').html(App.Story.createDropCap(d.intro)); }
  $el.find('.content .body-text').html(d.content);
  $el.find('.content .breakout_content').html(d.breakout_content);
  $el.find('.content .text_secondary').html(d.content_secondary);
  $el.find('.sfc-byline').html(d.author);
}

App.Story.createDropCap = function (text) {
  var cap       = text.substring(0,1);
  text          = text.substring(1, text.length);
  var introHTML = '<div class="drop-cap component"><ul class="grid"><li class="ot-letter-left yellow-letter"><span data-letter="' + cap + '" class="' + cap + '">' + cap + '</span></li></ul></div><div class="intro-text text">' + text + '</div>';
  return introHTML;
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

App.Story.bindGotoNextClick = function(){
  var self  = this;
  var e     = 'ontouchstart' in window ? 'touchstart' : 'click';

  this.$next.find('.big-image').on(e, function(e){
    e.preventDefault();
    $(this).unbind(e);

    self.animatePage(function(){
      self.createPost({ fromTemplate: true, type: 'next' });
      self.bindGotoNextClick();
      history.pushState( pageState(), '', "#" + self.currentPostIndex);
    });
  });
}

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
