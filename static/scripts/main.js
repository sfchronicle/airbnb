'use strict';

jQuery.ajaxSetup({ cache: false });

var App = App || {};

App.Map = App.Map || {
  width: 1200,
  height: 600,
  coordinates: [-122.4183, 37.7750],
  rendered: false
};

App.Map.load = function () {
  var self = this;
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
      .html(function(d) { return d.properties.Name; });

  var svg = d3.select('#map').append('div').classed('svg-container', true)
        .append('svg')
          .attr('viewBox', '0 0 '+self.width+' '+self.height)
          .attr('preserveAspectRatio', 'xMidYMid')
          .classed('svg-content-responsive', true)

  svg.call(tip)
    .call(renderTiles)
    //.call(renderSF)
    //.call(renderKML)
    .call(renderTopojson)
    .call(renderLegend)

  function slugify (text) {
    return text.toString().toLowerCase()
      .replace(/\s+/g, '-')           // Replace spaces with -
      .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
      .replace(/\-\-+/g, '-')         // Replace multiple - with single -
      .replace(/^-+/, '')             // Trim - from start of text
      .replace(/-+$/, '');            // Trim - from end of text
  }

  function renderLegend (svg) {
    d3.selectAll('.svg-container').append('div')
      .attr('class', 'legend');

    $('.legend').html('<ul class="button-group right"><ul>')
    $('.button-group')
      .append('<li><a href="#" class="button">2014</a></li>')
      .append('<li><a href="#" class="button">2015</a></li>')
  }

  function renderTopojson (svg) {
      d3.json('/static/data/2015-06-23-sf-airbnb-neighborhoods.topojson', function (error, json) {
        svg.append('g').selectAll('path')
          .data(topojson.feature(json, json.objects.neighborhoods).features)
        .enter().append('path')
          .attr('class', 'neighborhood')
          .attr('id', function (d) { return slugify(d.properties.Name); })
          .attr('d', path)
          .on('mouseover', tip.show)
          .on('mouseout', tip.hide);
      });
  }

  function renderKML (svg) {
    $.ajax('static/data/SFneighborhoods2014.kml').done(function (xml) {
      var neighborhoods = toGeoJSON.kml(xml);
      svg.append('g')
        .attr('class', 'neighborhoods')
      .selectAll('path')
        .data(neighborhoods.features)
      .enter().append('path')
        .attr('id', function (d) { return slugify(d.properties.name); })
        .attr('class', 'neighborhood')
        .attr('d', path);
    });
  }

  function renderSF (svg) {
    d3.json('/static/data/sf-neighborhoods.json', function (error, json) {
      svg.append('g').selectAll('path')
        .data(json.features)
      .enter().append('path')
        .attr('class', 'neighborhood')
        .attr('id', function (d) { return slugify(d.properties.neighborho); })
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
};

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
  $el.find('.content .text').html(d.content);
  $el.find('h3.byline time').html(d.date);
  $el.find('h3.byline .author').html(d.author);
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
