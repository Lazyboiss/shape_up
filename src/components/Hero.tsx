import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import Autoplay from "embla-carousel-autoplay";
import { useMemo, useRef } from "react";

type HomeProps = {
  setLevel: (level: number) => void;
};

export default function Home({ setLevel }: HomeProps) {
  const plugin = useRef(Autoplay({ delay: 2000, stopOnInteraction: false }));

  const howToPlay = useMemo(
    () => [
      { text: "Pick a level", image: "/Step 1.png" },
      { text: "Study the level", image: "/Step 2.png" },
      { text: "Press A to get ready (P1 & P2)", image: "/Step 3.png" },
      { text: "You have 30s to pose (P1 & P2)", image: "/Step 4.png" },
      { text: "Poses convert into platforms", image: "/Step 5.png" },
      { text: "You have 60s to reach your goal", image: "/Step 6.png" },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        
        * {
          font-family: 'Press Start 2P', cursive;
        }
      `}</style>

      <img
        src="/SHAPEUP.png"
        alt="Shape Up"
        className="w-full max-w-md aspect-[4/3] object-cover mb-8 pixelated"
        style={{ imageRendering: 'pixelated' }}
      />

      <Dialog>
        <DialogTrigger asChild>
          <Button 
            className="rounded-none border-4 border-[#00FF00] bg-black px-6 py-6 text-base font-bold text-[#00FF00] hover:bg-[#00FF00] hover:text-black transition-all duration-200 shadow-[4px_4px_0px_0px_#00FF00] hover:shadow-[2px_2px_0px_0px_#00FF00] active:shadow-none mb-10"
          >
            HOW TO PLAY
          </Button>
        </DialogTrigger>

        <DialogContent className="bg-black border-4 border-[#00FF00] text-[#00FF00] rounded-none">
          <DialogHeader>
            <DialogTitle className="text-[#00FF00] text-xl">HOW TO PLAY</DialogTitle>
            <DialogDescription className="text-[#00FF00]/80 text-xs leading-relaxed">
              A beginner&#39;s guide to Shape Up!
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-center">
            <Carousel
              className="w-full max-w-xs"
              opts={{ loop: true }}
              plugins={[plugin.current]}
            >
              <CarouselContent>
                {howToPlay.map((step, index) => (
                  <CarouselItem key={index}>
                    <div className="p-1">
                      <Card className="bg-black border-2 border-[#00FF00] rounded-none">
                        <CardContent className="flex flex-col aspect-square items-center justify-center p-6 text-center">
                          <img 
                            src={step["image"]} 
                            className="mb-4"
                            style={{ imageRendering: 'pixelated' }}
                          />
                          <span className="text-sm font-semibold text-[#00FF00] leading-relaxed mt-auto">
                            {index + 1}. {step["text"]}
                          </span>
                        </CardContent>
                      </Card>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="bg-black border-2 border-[#00FF00] text-[#00FF00] hover:bg-[#00FF00] hover:text-black" />
              <CarouselNext className="bg-black border-2 border-[#00FF00] text-[#00FF00] hover:bg-[#00FF00] hover:text-black" />
            </Carousel>
          </div>

          <DialogFooter className="sm:justify-center">
            <DialogClose asChild>
              <Button 
                type="button" 
                className="bg-black border-2 border-[#00FF00] text-[#00FF00] hover:bg-[#00FF00] hover:text-black rounded-none"
              >
                CLOSE
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex gap-6 mt-4 flex-wrap justify-center max-w-2xl">
        <Button
          onClick={() => setLevel(1)}
          className="rounded-none border-4 border-[#00FF00] bg-black px-8 py-6 text-2xl h-fit font-bold text-[#00FF00] hover:bg-[#00FF00] hover:text-black transition-all duration-200 shadow-[6px_6px_0px_0px_#00FF00] hover:shadow-[3px_3px_0px_0px_#00FF00] active:shadow-none"
        >
          LEVEL 1
        </Button>

        <Button
          onClick={() => setLevel(2)}
          className="rounded-none border-4 border-[#FF8C00] bg-black px-8 py-6 text-2xl h-fit font-bold text-[#FF8C00] hover:bg-[#FF8C00] hover:text-black transition-all duration-200 shadow-[6px_6px_0px_0px_#FF8C00] hover:shadow-[3px_3px_0px_0px_#FF8C00] active:shadow-none"
        >
          LEVEL 2
        </Button>

        <Button
          onClick={() => setLevel(3)}
          className="rounded-none border-4 border-[#00FF00] bg-black px-8 py-6 text-2xl h-fit font-bold text-[#00FF00] hover:bg-[#00FF00] hover:text-black transition-all duration-200 shadow-[6px_6px_0px_0px_#00FF00] hover:shadow-[3px_3px_0px_0px_#00FF00] active:shadow-none"
        >
          LEVEL 3
        </Button>

        <Button
          onClick={() => setLevel(4)}
          className="rounded-none border-4 border-[#FF8C00] bg-black px-8 py-6 text-2xl h-fit font-bold text-[#FF8C00] hover:bg-[#FF8C00] hover:text-black transition-all duration-200 shadow-[6px_6px_0px_0px_#FF8C00] hover:shadow-[3px_3px_0px_0px_#FF8C00] active:shadow-none"
        >
          LEVEL 4
        </Button>
      </div>
    </div>
  );
}