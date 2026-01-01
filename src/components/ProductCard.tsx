import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKSH } from "@/lib/currency";

interface ProductCardProps {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  category: string | null;
  onAddToCart: (productId: string) => void;
  isAddingToCart?: boolean;
}

const ProductCard = ({
  id,
  name,
  description,
  price,
  imageUrl,
  category,
  onAddToCart,
  isAddingToCart = false,
}: ProductCardProps) => {
  return (
    <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1">
      <div className="aspect-video relative overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="object-cover w-full h-full transition-transform duration-300 hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            No image
          </div>
        )}
        {category && (
          <Badge className="absolute top-2 right-2" variant="secondary">
            {category}
          </Badge>
        )}
      </div>
      <CardHeader className="pb-2">
        <h3 className="font-semibold text-lg line-clamp-1">{name}</h3>
      </CardHeader>
      <CardContent className="pb-2">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {description || "No description available"}
        </p>
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <span className="text-xl font-bold text-primary">
          {formatKSH(price)}
        </span>
        <Button
          size="sm"
          onClick={() => onAddToCart(id)}
          disabled={isAddingToCart}
          className="gap-2"
        >
          <ShoppingCart className="h-4 w-4" />
          Add to Cart
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ProductCard;
