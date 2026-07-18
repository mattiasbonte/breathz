package main

import (
	"embed"
	"io/fs"
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "github.com/wise/breathz/migrations"
)

//go:embed all:pb_public
var publicFS embed.FS

func main() {
	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: false,
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// BREATHZ_PUBLIC_DIR overrides the embedded frontend (useful in dev:
		// BREATHZ_PUBLIC_DIR=./pb_public go run . serve).
		var public fs.FS
		if dir := os.Getenv("BREATHZ_PUBLIC_DIR"); dir != "" {
			public = os.DirFS(dir)
		} else {
			sub, err := fs.Sub(publicFS, "pb_public")
			if err != nil {
				return err
			}
			public = sub
		}
		se.Router.GET("/{path...}", apis.Static(public, true))
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
