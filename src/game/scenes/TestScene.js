import Phaser from '/src/lib/phaser';

import ImageResource from '/src/engine/resources/ImageResource';
import JSONResource from '/src/engine/resources/JSONResource';

import Scene from '/src/engine/core/Scene';
import Image from '/src/engine/objects/Image';
import MatterImage from '/src/engine/objects/MatterImage';
import Sprite from '/src/engine/objects/Sprite';
import SpriteSheetResource from '/src/engine/resources/SpriteSheetResource';
import Vector2 from '/src/engine/math/Vector2';

import config from '/src/config';

import DroppableItemType from '/src/game/objects/DroppableItemType';
import DroppableItem from '/src/game/objects/DroppableItem';
import Health from '/src/game/objects/Health';
import ScoreText from '/src/game/objects/ScoreText';

export default class TestScene extends Scene {
  resources = {
    shapes: new JSONResource('assets/jsons/shapes.json'),
    boat: new ImageResource('assets/static_props/boat.png'),
    background: new ImageResource('assets/backgrounds/Background_Wide_V2.png'),
    player: new SpriteSheetResource('assets/player/Worker_bot_sprites.png', {
      frameWidth: 64,
      frameHeight: 48
    })
  };

  eventHandlers = {
    input: {
      pointerdown: this.onMouseDown,
      pointerup: this.onMouseUp
    },
    keydown: {
      SPACE: this.demolish
    }
  }

  // TODO config
  chargeFactor = 250;
  minCharge = .5;
  maxCharge = 5;

  boatVelocity = -.2;

  itemCount = 0;
  roundItemCount = 0;
  currentTowerHeight = 0;

  lastTowerHeight = null;
  chargeStartTime = null;
  itemInPlayerHand = null;
  scoreText = null;
  boat = null;
  health = null;
  items = [];
  player = null;
  staticItems = [];
  followItem = null;

  canSpawnItem = false;
  demolish = false;

  currentItemType = DroppableItemType.CARDBOARD_BOX;

  //nextItemTypes = Array(10).fill(DroppableItemType.CARDBOARD_BOX);
  nextItemTypes = [
    //DroppableItemType.CARDBOARD_BOX,
    DroppableItemType.SHIPPING_CONTAINER,
    DroppableItemType.SAFE,
    DroppableItemType.WOODEN_CRATE,
    DroppableItemType.GRASS_BLOCK,
    DroppableItemType.ROTARY_PHONE,
    DroppableItemType.GIFT_BOX,
    DroppableItemType.CRT_SCREEN,
    DroppableItemType.WASHING_MACHINE,
    DroppableItemType.WIDE_PAINTING,
    DroppableItemType.WIDE_PLANK
  ];

  constructor() {
    super({
      physics: {
        default: 'matter',
        matter: {
          enableSleeping: true,
          gravity: {
            y: 1
          },
          debug: {
            showBody: true,
            showStaticBody: true
          }
        }
      }
    });
  }

  get shapes() {
    return this.cache.json.get(this.res.shapes);
  }

  demolish() {
    // Move all current items over to static items
    this.staticItems.push(...this.items);

    this.demolish = true;

    const time = Math.floor(Math.abs(this.cameraPosition.y * 1.5));

    this.debug('Start demolish, time:', time);

    this.panToBoat(time, this.cameraOrigin.y);

    const demolishInterval = setInterval(() => {
      this.debug('Demolish interval!');

      const { y, height } = this.cameras.main.worldView;

      if (y === 0) {
        clearInterval(demolishInterval);

        this.boatVelocity = .1;
      }

      for (const item of this.staticItems) {
        if (item.scene && item.y < y + height) {
          if (item.isStatic()) {
            item.demolish = true;

            item.setStatic(false).applyForce(new Vector2(Phaser.Math.FloatBetween(-.1, .1), item.y / 100000));
          }
        }
      }
    }, 500);
  }

  spawnItem(screenX, screenY) {
    if (this.currentItemType !== null) this.nextItemTypes.push(this.currentItemType);
    this.currentItemType = this.nextItemTypes.shift();

    const itemPosition = this.viewportToWorld(screenX, screenY), opt = {};

    if (this.shapes[this.currentItemType.name]) opt.shape = this.shapes[this.currentItemType.name];

    const item = new DroppableItem(this.currentItemType, this.matter.world, itemPosition.x, itemPosition.y, this.currentItemType.res, 0, opt);

    this.add.existing(item);
    this.items.push(item);

    // Increase item count and round item count
    this.itemCount++;
    this.roundItemCount++;

    this.canSpawnItem = false;
  }

  onItemStop(item) {
    setTimeout(() => {
      this.followItem = null;

      this.panToPlayer(() => this.player.anims.play('pickup_item', true));
    }, 500);
  }

  throwItem() {
    const velocityVector = new Vector2(
      Math.sin(this.player.rotation) * this.charge,
      -Math.cos(this.player.rotation) * this.charge
    );

    const item = this.itemInPlayerHand
      .setStatic(false)
      .applyForce(velocityVector)
      .onStop(this.onItemStop.bind(this));

    this.items.push(item);

    this.followItem = item;

    // Increase item count and round item count
    this.itemCount++;
    this.roundItemCount++;

    // Add current item type at the end of next items array
    if (this.currentItemType !== null) this.nextItemTypes.push(this.currentItemType);

    // Get new current item type from the start of next items array
    this.currentItemType = this.nextItemTypes.shift();

    this.canSpawnItem = false;
    this.itemInPlayerHand = null;
  }

  // Create item on mouse click
  onMouseDown() {
    if (this.canSpawnItem && this.roundItemCount !== config.itemsPerRound) {
      this.chargeStartTime = this.time.now;
    }
  }

  onMouseUp() {
    if (this.canSpawnItem && this.chargeStartTime !== null) {
      this.debug('Liftoff! Charge time:', this.charge);

      this.chargeStartTime = null;

      // Spawn item at player position
      if (this.canSpawnItem) this.throwItem();

      // Update next items textures
      this.upcomingItem1.setTexture(this.nextItemTypes[0].res);
      this.upcomingItem2.setTexture(this.nextItemTypes[1].res);
      this.upcomingItem3.setTexture(this.nextItemTypes[2].res);
    }
  }

  shouldRoundEnd() {
    // Check if there are itemsPerRound items
    if (this.roundItemCount === config.itemsPerRound) {
      let allItemsStatic = true;

      // Check if all items have stopped moving
      for (const item of this.items) {
        if (!item.hasStopped) allItemsStatic = false;
      }

      return allItemsStatic;
    }

    return false;
  }

  moveCamera() {
    const y = Math.min(this.cameraCenter.y, this.cameraOrigin.y - this.currentTowerHeight + 300);
    const diff = Math.abs(this.cameraCenter.y - y);
    const timeMs = 8 * Math.floor(diff);

    this.debug('Moving camera, demolish:', this.demolish);

    this.cameras.main.pan(this.cameraCenter.x, y, timeMs, 'Sine.easeInOut');
  }

  newRound() {
    let score = 0;

    for (const item of this.items) {
      item.setStatic(true);
      item.setTint(0x7878ff);

      score = Math.floor(Math.max(this.currentTowerHeight, 720 - item.y)) / 50;

      this.currentTowerHeight = Math.max(this.currentTowerHeight, 720 - item.y);
      this.staticItems.push(item);
    }

    this.scoreText.updateScore(score);

    this.items = [];
    this.roundItemCount = 0;

    if (this.lastTowerHeight === null) this.lastTowerHeight = this.currentTowerHeight;
    else if (this.lastTowerHeight < this.currentTowerHeight - 100) {
      if (!this.demolish) this.moveCamera();

      this.lastTowerHeight = this.currentTowerHeight;
    }
  }

  createPlayer() {
    this.player = new Sprite(this, 100, 250, this.res.player)
      .setScale(1.5, 1.5)
      .setOrigin(.5, .5);

    this.add.existing(this.player);

    // Animations setup
    this.anims.create({
      key: 'pickup_item',
      frames: this.anims.generateFrameNumbers(this.res.player, { start: 0, end: 3 }),
      frameRate: 10,
      repeat: 0
    });

    this.player.on('animationcomplete', (animation) => {
      if(animation.key === 'pickup_item'){
        this.canSpawnItem = true;

        const { x, y } = this.worldToViewport(this.player.x, this.player.y);

        this.itemInPlayerHand = new DroppableItem(this.currentItemType, this.matter.world, x, y, this.currentItemType.res).setStatic(true);

        this.add.existing(this.itemInPlayerHand);
      }
    });
  }

  updatePlayer() {
    const fullPlayerRotation = Math.atan2(this.input.mousePointer.x - this.player.x, -(this.input.mousePointer.y - this.player.y));
    const playerRotation = Math.max(Math.min(fullPlayerRotation, Math.PI / 2), 0);

    this.player.setRotation(playerRotation);

    // Match item in hand to player
    if(this.itemInPlayerHand !== null) {
      const { x: playerWorldX, y: playerWorldY } = this.viewportToWorld(this.player.x, this.player.y);

      const offset = this.player.height * this.player.scaleY / 2 + this.itemInPlayerHand.height * this.itemInPlayerHand.scaleY / 2 - 8;

      this.itemInPlayerHand.x = playerWorldX + Math.sin(playerRotation) * offset;
      this.itemInPlayerHand.y = playerWorldY - Math.cos(playerRotation) * offset;

      this.itemInPlayerHand.setRotation(playerRotation);
    }
  }

  panToBoat(time = 1000, y = null, ease = 'Sine.easeInOut') {
    if (y === null) y = this.cameraOrigin.y;

    const boatStartX = -this.boat.width * this.boat.scaleX - 80;
    const boatEndX = boatStartX + this.boat.width * this.boat.scaleX;

    this.cameras.main.pan(this.boat.x, y, time, ease);
  }

  panToPlayer(callback, ease = 'Sine.easeInOut') {
    const time = this.cameras.main.scrollX;

    this.cameras.main.pan(this.cameraOrigin.x, this.screenCenter.y, time, ease);

    if (typeof callback === 'function') setTimeout(callback, time);
  }

  onPreload() {
    DroppableItemType.preloadAll(this);
  }

  onCreate() {
    this.debug('Game.onCreate()');

    this.cameras.main.setBackgroundColor('#000000');
    this.cameras.main.setLerp(new Vector2(0.1, 0.1));

    const bgX = -500, bgScale = 6;
    const bgImage = new Image(this, bgX, 720, this.res.background).setOrigin(.4, 1).setScale(bgScale, bgScale);

    this.add.existing(bgImage);
    this.add.existing(new Image(this, bgX + bgImage.width * bgScale, 720, this.res.background).setOrigin(.4, 1).setScale(bgScale, bgScale));

    if (!config.itemRain) this.createPlayer();

    this.health = new Health(3);
    this.health.on(0, () => this.debug('RIP'));

    // Das Boot
    this.boat = new MatterImage(this.matter.world, 2000, 680, this.resources.boat, 0, {
      shape: this.shapes.boat
    }).setStatic(true).setScale(4, 4).setDepth(1);

    this.add.existing(this.boat);

    this.scoreText = new ScoreText(this);

    this.add.text(250, 8, 'UPCOMING ITEMS:');
    //this.add.text(50, 400, '(eka vasemmalt)');

    const upcomingX = 250, upcomingY = 40, upcomingStep = 50;

    // Next items
    this.upcomingItem1 = new Image(this, upcomingX, upcomingY, this.nextItemTypes[0].res).setOrigin(0, 0);
    this.add.existing(this.upcomingItem1);

    this.upcomingItem2 = new Image(this, upcomingX + upcomingStep, upcomingY, this.nextItemTypes[1].res).setOrigin(0, 0);
    this.add.existing(this.upcomingItem2);

    this.upcomingItem3 = new Image(this, upcomingX + upcomingStep * 2, upcomingY, this.nextItemTypes[2].res).setOrigin(0, 0);
    this.add.existing(this.upcomingItem3);

    // Psykoosit tulille
    if (config.itemRain) {
      setInterval(() => {
        if (!this.demolish && this.roundItemCount < config.itemsPerRound) {
          this.spawnItem(Phaser.Math.FloatBetween(200, 1280 - 200), 0, false);
        }
      }, 100);
    }
  }

  onUpdate(time, delta) {
    if (this.boatVelocity !== 0) {
      this.boat.x += delta * this.boatVelocity;

      if (this.boatVelocity < 0 && (config.skipBoatArriving || this.boat.x < 1200)) {
        this.boat.x = 1200;
        this.boatVelocity = 0;

        if (config.itemRain) this.panToBoat(0);
        else this.player.anims.play('pickup_item', true);
      } else if (this.boatVelocity > 0 && this.demolish) {
        // Move items along with the boat
        for (const item of this.staticItems) {
          if (item.scene) {
            item.x += delta * this.boatVelocity;
            item.thrust(0.01);
          }
        }
      }
    }

    for (let i = 0; i < this.items.length; i++) {
      // Delete items that are not in the boat
      if (this.items[i].y > this.cameras.main.worldView.bottom || this.items[i].x > this.boat.x + 1500) {
        this.items[i].destroy();
        this.items.splice(i, 1);
        this.health.decrease();

        continue;
      }

      // Update item
      this.items[i].onUpdate(this.boat.x);
    }

    if (this.shouldRoundEnd()) this.newRound();

    if (!config.itemRain) this.updatePlayer();

    if (this.canSpawnItem && this.chargeStartTime !== null) {
      this.charge = (this.time.now - this.chargeStartTime) / this.chargeFactor;

      if (this.charge < this.minCharge) {
        this.charge = this.minCharge;

        this.debug('min charge');
      }

      if (this.charge > this.maxCharge) {
        this.charge = this.maxCharge;

        this.debug('MAX CHARGE');
      }
    }

    if (this.followItem) {
      if (this.followItem.scene) {
        if (this.cameras.main.midPoint.x < this.followItem.x && this.cameras.main.midPoint.x < this.boat.x + 60) {
          this.cameras.main.scrollX += delta;
        }
      } else {
        this.followItem = null;
      }
    }
  }

  debugStrings(){
    return [
      `Item Count: ${this.itemCount}`,
      `Round Item Count: ${this.roundItemCount}`,
      `Health: ${this.health}`,
      `Tower height: ${Math.floor(this.currentTowerHeight)} px`
    ];
  }
}

