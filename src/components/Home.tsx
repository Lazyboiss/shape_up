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
  const plugin = useRef(Autoplay({ delay: 1500, stopOnInteraction: false }));

  const howToPlay = useMemo(
    () => [
      "Pick a level",
      "Study the level",
      "Press A to get ready (P1 & P2)",
      "You have 30s to pose (P1 & P2)",
      "Poses convert into platforms",
      "You have 60s to reach your goal",
    ],
    []
  );

  return (
    <>
      <img
        src="/SHAPEUP.png"
        alt="Shape Up"
        className="w-full max-w-md aspect-[4/3] object-cover"
      />

      <Dialog>
        <DialogTrigger asChild>
          <Button className="rounded-md bg-blue-500 px-6 py-5 text-xl font-semibold text-white hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
            How To Play
          </Button>
        </DialogTrigger>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>How To Play</DialogTitle>
            <DialogDescription>
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
                      <Card>
                        <CardContent className="flex aspect-square items-center justify-center p-6 text-center">
                          <span className="text-2xl font-semibold">
                            {index + 1}. {step}
                          </span>
                        </CardContent>
                      </Card>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>

          <DialogFooter className="sm:justify-center">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex gap-6 mt-10 flex-wrap justify-center">
        <Button
          onClick={() => setLevel(1)}
          className="rounded-md bg-green-500 px-6 py-3 text-4xl h-fit font-semibold text-white hover:bg-green-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500"
        >
          Level 1
        </Button>

        <Button
          onClick={() => setLevel(2)}
          className="rounded-md bg-yellow-500 px-6 py-3 text-4xl h-fit font-semibold text-white hover:bg-yellow-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500"
        >
          Level 2
        </Button>

        <Button
          onClick={() => setLevel(3)}
          className="rounded-md bg-red-500 px-6 py-3 text-4xl h-fit font-semibold text-white hover:bg-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
        >
          Level 3
        </Button>
      </div>
    </>
  );
}
