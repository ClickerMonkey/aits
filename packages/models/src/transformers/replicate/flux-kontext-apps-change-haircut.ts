import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    gender?: Schemas["gender"];
    haircut?: Schemas["haircut"];
    hair_color?: Schemas["hair_color"];
    input_image: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    output_format?: Schemas["output_format"];
    safety_tolerance?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  gender: "none" | "male" | "female";
  haircut: "No change" | "Random" | "Straight" | "Wavy" | "Curly" | "Bob" | "Pixie Cut" | "Layered" | "Messy Bun" | "High Ponytail" | "Low Ponytail" | "Braided Ponytail" | "French Braid" | "Dutch Braid" | "Fishtail Braid" | "Space Buns" | "Top Knot" | "Undercut" | "Mohawk" | "Crew Cut" | "Faux Hawk" | "Slicked Back" | "Side-Parted" | "Center-Parted" | "Blunt Bangs" | "Side-Swept Bangs" | "Shag" | "Lob" | "Angled Bob" | "A-Line Bob" | "Asymmetrical Bob" | "Graduated Bob" | "Inverted Bob" | "Layered Shag" | "Choppy Layers" | "Razor Cut" | "Perm" | "Ombré" | "Straightened" | "Soft Waves" | "Glamorous Waves" | "Hollywood Waves" | "Finger Waves" | "Tousled" | "Feathered" | "Pageboy" | "Pigtails" | "Pin Curls" | "Rollerset" | "Twist Out" | "Bantu Knots" | "Dreadlocks" | "Cornrows" | "Box Braids" | "Crochet Braids" | "Double Dutch Braids" | "French Fishtail Braid" | "Waterfall Braid" | "Rope Braid" | "Heart Braid" | "Halo Braid" | "Crown Braid" | "Braided Crown" | "Bubble Braid" | "Bubble Ponytail" | "Ballerina Braids" | "Milkmaid Braids" | "Bohemian Braids" | "Flat Twist" | "Crown Twist" | "Twisted Bun" | "Twisted Half-Updo" | "Twist and Pin Updo" | "Chignon" | "Simple Chignon" | "Messy Chignon" | "French Twist" | "French Twist Updo" | "French Roll" | "Updo" | "Messy Updo" | "Knotted Updo" | "Ballerina Bun" | "Banana Clip Updo" | "Beehive" | "Bouffant" | "Hair Bow" | "Half-Up Top Knot" | "Half-Up, Half-Down" | "Messy Bun with a Headband" | "Messy Bun with a Scarf" | "Messy Fishtail Braid" | "Sideswept Pixie" | "Mohawk Fade" | "Zig-Zag Part" | "Victory Rolls";
  hair_color: "No change" | "Random" | "Blonde" | "Brunette" | "Black" | "Dark Brown" | "Medium Brown" | "Light Brown" | "Auburn" | "Copper" | "Red" | "Strawberry Blonde" | "Platinum Blonde" | "Silver" | "White" | "Blue" | "Purple" | "Pink" | "Green" | "Blue-Black" | "Golden Blonde" | "Honey Blonde" | "Caramel" | "Chestnut" | "Mahogany" | "Burgundy" | "Jet Black" | "Ash Brown" | "Ash Blonde" | "Titanium" | "Rose Gold";
  aspect_ratio: "match_input_image" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3" | "4:5" | "5:4" | "21:9" | "9:21" | "2:1" | "1:2";
  output_format: "jpg" | "png";
};

export default {
  "flux-kontext-apps/change-haircut": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          input_image: await toURL(request.image),
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}