import { Star } from "lucide-react";

interface RatingStarsProps {
    value: number | null;
    onChange?: (rating: number) => void;
}

/** 1-5 star rating; interactive when `onChange` is provided (Host, ended). */
export function RatingStars({ value, onChange }: RatingStarsProps) {
    const stars = [1, 2, 3, 4, 5];
    return (
        <div className="flex items-center gap-0.5" role={onChange ? "radiogroup" : undefined}>
            {stars.map((star) => (
                <button
                    key={star}
                    type="button"
                    disabled={!onChange}
                    onClick={() => onChange?.(star)}
                    aria-label={`${star} star${star > 1 ? "s" : ""}`}
                    className={`transition-transform ${onChange ? "hover:scale-110 cursor-pointer" : "cursor-default"}`}
                >
                    <Star
                        size={20}
                        className={
                            value != null && star <= value
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/30"
                        }
                    />
                </button>
            ))}
        </div>
    );
}
