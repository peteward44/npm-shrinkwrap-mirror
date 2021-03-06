'use strict';

var path = require( 'path' );
var domain = require( 'domain' );
var fs = require( 'fs-extra' );
var url = require( 'url' );
var async = require( 'async' );
var request = require('request');



function getOutPath( outdir, urlstr ) {
	var parsed = url.parse( urlstr );
	return path.join( outdir, parsed.path );
}


function buildNewUrl( newRootUrl, urlstr ) {
	var parsed = url.parse( urlstr );
	if ( newRootUrl[ newRootUrl.length-1 ] !== '/' ) {
		newRootUrl += '/';
	}
	var suffix = parsed.path;
	if ( suffix[0] === '/' ) {
		suffix = suffix.substr( 1 );
	}
	return newRootUrl + suffix;
}


function doesExistInQueue( output, url, outpath ) {
	for ( var i=0; i<output.length; ++i ) {
		var o = output[i];
		if ( o.url === url && o.out === outpath ) {
			return true;
		}
	}
	return false;
}


function getFilesToDownload( swjson, newRootUrl, outdir, force, output ) {
	output = output || [];
	if ( !swjson.dependencies ) {
		return output;
	}
	for ( var name in swjson.dependencies ) {
		if ( swjson.dependencies.hasOwnProperty( name ) ) {
			var dep = swjson.dependencies[ name ];
			try {
				if ( dep.resolved ) {
					var matches = dep.resolved.match( /(^https\:\/\/registry\.npmjs\.org\/)(.*\.tgz$)/i );
					if ( matches ) {
						var outpath = getOutPath( outdir, dep.resolved );
						var newUrl = buildNewUrl( newRootUrl, dep.resolved );
						if ( force || !fs.existsSync( outpath ) ) {
							if ( !doesExistInQueue( output, dep.resolved, outpath ) ) {
								output.push( { url: dep.resolved, out: outpath } );
							}
						}
						dep.resolved = newUrl;
					}
				}
			}
			catch ( err ) {} // not a proper URL - probably a git repo
			getFilesToDownload( dep, newRootUrl, outdir, force, output );
		}
	}
	return output;
}


function download( options, file, callback ) {
	function onError( err ) {
		if ( !options.quiet ) {
			console.error( "Error downloading '" + file.url + "'", err );
		}
		callback();
	}
	var d = domain.create();
	d.on( 'error', onError );
	d.run( function() {
		var dir = path.dirname( file.out );
		fs.ensureDirSync( dir );
		if ( !options.quiet ) {
			console.log( "Downloading " + file.url );
		}
		var r = request( file.url );
		r.on('response', function( resp ) {
			if ( resp.statusCode === 200 ) {
				r.pipe( fs.createWriteStream( file.out ) )
					.on( 'error', onError )
					.on( 'close', callback );
			} else {
				onError( 'Status code: ' + resp.statusCode );
			}
		});
	} );
}


function start( options, callback ) {
	options = options || {};
	if ( !options.url ) {
		if ( callback ) {
			callback( '"url" must be specified in options!' );
		}
		return;
	}
	options.shrinkwrap = options.shrinkwrap || 'npm-shrinkwrap.json';
	options.outdir = options.outdir || 'www';
	options.downloadLimit = options.downloadLimit || 4;
	options.shrinkwrap = path.resolve( options.shrinkwrap );
	options.quiet = options.quiet === false ? false : true; // default quiet to true if not specified
	if ( !fs.existsSync( options.shrinkwrap ) ) {
		var msg = "Shrinkwrap file '" + options.shrinkwrap + "' not found! Run 'npm shrinkwrap' in your project before running npm-shrinkwrap-mirror";
		if ( !options.quiet ) {
			console.error( msg );
		}
		if ( callback ) {
			callback( msg );
		}
		return;
	}
	if ( !options.outshrinkwrap ) {
		options.outshrinkwrap = options.shrinkwrap;
	}
	options.outshrinkwrap = path.resolve( options.outshrinkwrap );
	
	var swjson = JSON.parse( fs.readFileSync( options.shrinkwrap ) );

	options.outdir = path.resolve( options.outdir );
	fs.ensureDirSync( options.outdir );
	var files = getFilesToDownload( swjson, options.url, options.outdir, options.force );
	if ( files.length <= 0 ) {
		if ( !options.quiet ) {
			console.log( "No new packages found to download" );
		}
	}
	async.eachLimit(
		files,
		parseInt( options.downloadLimit, 10 ),
		function( file, cb ) { download( options, file, cb ); },
		function( err ) {
			if ( err ) {
				if ( !options.quiet ) {
					console.error( "Download queue aborted" );
					console.error( err );
				}
			} else {
				fs.writeFileSync( options.outshrinkwrap, JSON.stringify( swjson, null, 2 ) );	
				if ( !options.quiet ) {
					console.log( "Complete - mirrored packages are now in '" + options.outdir + "'" );
				}
			}
			if ( callback ) {
				callback( err );
			}
		}
	);
}

module.exports = start;
