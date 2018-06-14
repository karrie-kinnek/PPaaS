const GIFEncoder = require('gifencoder');
const gifFrames = require('gif-frames');
const ParrotFramesReader = require("./ParrotFramesReader");
const ParrotFrameHandler = require("./ParrotFrameHandler");
const ParrotConfig = require("./ParrotConfig");
const ImageFactory = require("./ImageFactory");
const config = require("./config");
var Canvas = require('canvas');

document = {
    createElement: () => new Canvas(50, 50)
}

function ParrotConstructor() {
    this.imageFactory = new ImageFactory();
    this.setBaseParrot("parrot");
}

function gcd(a, b) {
    return !b ? a : gcd(b, a % b);
}

function lcm(a, b) {
    return (a * b) / gcd(a, b);
}

ParrotConstructor.prototype.start = function(writeStream, configuration) {
    this.encoder = new GIFEncoder(this.parrotConfig.getWidth(), this.parrotConfig.getHeight());
    this.encoder.createReadStream().pipe(writeStream);
    this.encoder.start();
    this.encoder.setTransparent("#000000");
    this.encoder.setRepeat(0);
    this.encoder.setDelay(configuration.delay || 40);
    this.numberOfLoops = Math.ceil((configuration.colors ? configuration.colors.length : 1) / this.parrotConfig.getNumberOfFrames());
    this.colors = configuration.colors;
}

ParrotConstructor.prototype.setBaseParrot = function(parrotType) {
    this.parrotConfig = new ParrotConfig(parrotType);
}

ParrotConstructor.prototype.getFramesHandlers = function() {
    if(!this.parrotFrameHandlers) {
        this.initializeFramesHandlers();
    }
    return this.parrotFrameHandlers;
}

ParrotConstructor.prototype.initializeFramesHandlers = function() {
    const loadWhiteParrot = !!this.colors;
    const framesReader = new ParrotFramesReader(this.parrotConfig, loadWhiteParrot);

    const mapImageToFrameHandler = (image) => {
        var frameHandler = new ParrotFrameHandler(this.parrotConfig);
        frameHandler.addImage(image);
        return frameHandler;
    };
    const allImages = framesReader.getFrames().map((file) => {
        console.log(file);
        return this.imageFactory.fromFileSync(file);
    });

    let allFrameHandlers = [];

    for (let i=0; i<this.numberOfLoops; i++) {
        allFrameHandlers = allFrameHandlers.concat(allImages.map(mapImageToFrameHandler));
    }

    if (this.colors && this.colors.length > 0) {
        allFrameHandlers.forEach((frameHandler, i) => {
            frameHandler.applyColor(this.colors[i % this.colors.length]);
        })
    }

    this.parrotFrameHandlers = allFrameHandlers;
}

ParrotConstructor.prototype.addOverlayImage = function(overlay) {
    gifFrames({ url: 'overlay', frames: 'all', outputType: 'canvas' }).then(frames => {
        const parrotFrames = this.getFramesHandlers();
        const maxFrames = lcm(frames.length, parrotFrames.length);

        for (let i = 0; i < maxFrames/parrotFrames; i++) {
            this.parrotFrameHandlers = this.parrotFrameHandlers.concat(parrotFrames);
        }

        for (let i = 0; i < maxFrames/frames; i++) {
            this.frames = this.frames.concat(frames);
        }

        frameData[0].getImage();
        this.getFramesHandlers().map((handler, index) => {
            handler.addImage(frames[index]);
        });
    });
}

ParrotConstructor.prototype.addFollowingOverlayImage = function(overlay, offsetX, offsetY, width, height, flipX, flipY) {
    let followingFrames = this.parrotConfig.getFollowingFrames();

    let imageHeight = parseInt(height);
    let imageWidth = parseInt(width);


    if(this.parrotConfig.shouldFlipX()) {
        flipX = !flipX;
    }
    if(this.parrotConfig.shouldFlipY()) {
        flipY = !flipY;
    }

    let frameHandler = function(handler, frame={}, imageFrame) {
        let shouldFlipX = frame.flipX ? !flipX : flipX;
        let shouldFlipY = frame.flipY ? !flipY : flipY;

        handler.addResizedImage(imageFrame,
                                flipPositionIfActivated(frame.x, imageWidth, shouldFlipY) + (offsetX || 0),
                                flipPositionIfActivated(frame.y, imageHeight, shouldFlipX) + (offsetY || 0),
                                flipSizeIfActivated(imageWidth, shouldFlipY),
                                flipSizeIfActivated(imageHeight, shouldFlipX));
    };

    return getOverlayType(overlay) === 'gif' ? addOverlayToGif.call(this, overlay, frameHandler) : addOverlayToImage.call(this, overlay, followingFrames, frameHandler);

}

function getOverlayType(overlay) {
    let type = 'image';
    const reGif = /^.*\.(gif).*$/i;
    if (reGif.exec(overlay) !== null) {
        type = 'gif';
    }
    return type;
}

function addOverlayToImage(overlay, followingFrames, frameHandler) {
    return this.imageFactory.get(overlay).then((image) => {
        this.getFramesHandlers().map((handler, index) => {
            let currentFrame = followingFrames[index];
            if (currentFrame.multiple) {
                currentFrame.multiple.forEach(frame => {
                    frameHandler(handler, frame);
                })
            } else {
                frameHandler(handler, currentFrame);
            }
        });
    });
}

function addOverlayToGif(overlay, frameHandler) {
    return gifFrames({ url: overlay, frames: 'all', outputType: 'canvas' }).then(images => {
        const parrotFrames = this.getFramesHandlers();
        let imageFrames = images;
        const maxFrames = lcm(images.length, parrotFrames.length);

        while (this.parrotFrameHandlers.length < maxFrames) {
            this.parrotFrameHandlers = this.parrotFrameHandlers.concat(parrotFrames);
        }

        while (imageFrames.length < maxFrames) {
            imageFrames = imageFrames.concat(this.parrotFrameHandlers);
        }

        this.getFramesHandlers().map((handler, index) => {
            try { frameHandler(handler, {}, imageFrames[index].getImage()); }
            catch (e) { console.log(index) }
        });
    });
}

function flipPositionIfActivated(currentPosition, size, flip) {
    return flip ? (currentPosition + size) : currentPosition;
}

function flipSizeIfActivated(currentSize, flip) {
    return flip ? currentSize * -1 : currentSize;
}

ParrotConstructor.prototype.finish = function() {
    this.getFramesHandlers().forEach(handler => {
        this.encoder.addFrame(handler.getFrame());
    });
    this.encoder.finish();
}

module.exports = ParrotConstructor;
