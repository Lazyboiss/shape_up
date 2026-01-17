import "@/App.css";
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

export function App() {
  return (
    <div className="fullHeight bg-sky-300 w-full text-white flex flex-col justify-center items-center">
      <img
        src="/SHAPEUP.png"
        alt="asd"
        className="w-100 aspect-4/3 object-cover"
      />
      <Dialog>
        <DialogTrigger asChild>
          <Button className="rounded-md bg-blue-500 px-6.5 py-5.5 text-xl font-semibold text-white hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
            How To Play
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How To Play</DialogTitle>
            <DialogDescription>
              A beginners guide to play Shape Up!
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            <Carousel className="w-full max-w-xs">
              <CarouselContent>
                {Array.from({ length: 5 }).map((_, index) => (
                  <CarouselItem key={index}>
                    <div className="p-1">
                      <Card>
                        <CardContent className="flex aspect-square items-center justify-center p-6">
                          <span className="text-4xl font-semibold">
                            {index + 1}
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
      <div className="flex gap-20 mt-10">
        <Button className="rounded-md bg-green-500 px-6.5 py-3.5 text-4xl h-fit font-semibold text-white hover:bg-green-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500">
          Level 1
        </Button>
        <Button className="rounded-md bg-yellow-500 px-6.5 py-3.5 text-4xl h-fit font-semibold text-white hover:bg-yellow-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500">
          Level 2
        </Button>
        <Button className="rounded-md bg-red-500 px-6.5 py-3.5 text-4xl h-fit font-semibold text-white hover:bg-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500">
          Level 3
        </Button>
      </div>
    </div>
  );
}
