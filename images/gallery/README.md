Gallery photos, resized for the web from the original `Photos/` folder (which stays out of git: the originals are ~380 MB).

- `full/NN.jpg` — up to 1600px, used by the slideshow
- `thumb/NN.jpg` — up to 600px, used by the grid

All camera metadata (including GPS location) is stripped. To add a photo, make both sizes, then add a `<figure>` to the grid in `gallery.html`; the slideshow picks up every photo in the grid automatically:

```html
<figure><a href="images/gallery/full/66.jpg" data-slide><img src="images/gallery/thumb/66.jpg" loading="lazy" alt="Describe the moment"></a></figure>
```
