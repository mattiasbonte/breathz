package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		col := core.NewBaseCollection("sequences")

		col.Fields.Add(
			&core.TextField{Name: "name", Required: true, Max: 100},
			&core.TextField{Name: "description", Max: 500},
			// phases: array of {kind: "inhale"|"hold"|"exhale", seconds: number}
			&core.JSONField{Name: "phases", Required: true, MaxSize: 4096},
			// Required: PocketBase skips Min/Max on optional number fields when
			// the value is 0 (zero counts as empty).
			&core.NumberField{Name: "cycles", Required: true, OnlyInt: true, Min: types.Pointer(1.0), Max: types.Pointer(500.0)},
			&core.BoolField{Name: "is_preset"},
			&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, CascadeDelete: true},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)

		col.AddIndex("idx_sequences_owner", false, "owner", "")
		col.AddIndex("idx_sequences_preset", false, "is_preset", "")

		col.ListRule = types.Pointer("is_preset = true || owner = @request.auth.id")
		col.ViewRule = types.Pointer("is_preset = true || owner = @request.auth.id")
		col.CreateRule = types.Pointer("@request.auth.id != '' && owner = @request.auth.id && is_preset = false")
		// The update rule is evaluated against the stored record, so the body
		// must be constrained explicitly or a user could flip is_preset /
		// re-assign owner on their own records.
		col.UpdateRule = types.Pointer("owner = @request.auth.id && is_preset = false" +
			" && (@request.body.is_preset:isset = false || @request.body.is_preset = false)" +
			" && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)")
		col.DeleteRule = types.Pointer("owner = @request.auth.id && is_preset = false")

		return app.Save(col)
	}, func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("sequences")
		if err != nil {
			return nil
		}
		return app.Delete(col)
	})
}
